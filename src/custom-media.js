import { ValidationError } from './errors';
import { parse as urlParse } from 'url';
import net from 'net';
import Media from './media';
import { get as httpGet } from 'http';
import { get as httpsGet } from 'https';

const LOGGER = require('@calzoneman/jsli')('custom-media');

const SOURCE_QUALITIES = new Set([
    240,
    360,
    480,
    540,
    720,
    1080,
    1440,
    2160
]);

const SOURCE_CONTENT_TYPES = new Set([
    'application/dash+xml',
    'application/x-mpegURL',
    'audio/aac',
    'audio/ogg',
    'audio/mpeg',
    'audio/opus',
    'video/mp4',
    'video/ogg',
    'video/webm'
]);

const LIVE_ONLY_CONTENT_TYPES = new Set([
    'application/dash+xml'
]);

export function lookup(url, opts) {
    if (!opts) opts = {};
    if (!opts.hasOwnProperty('timeout')) opts.timeout = 10000;

    return new Promise((resolve, reject) => {
        const options = {
            headers: {
                'Accept': 'application/json'
            }
        };

        Object.assign(options, parseURL(url));

        if (!/^https?:$/.test(options.protocol)) {
            reject(new ValidationError(
                `Unacceptable protocol "${options.protocol}".  Custom metadata must be`
                    + ' retrieved by HTTP or HTTPS'
            ));

            return;
        }

        LOGGER.info('Looking up %s', url);

        // this is fucking stupid
        const get = options.protocol === 'https:' ? httpsGet : httpGet;
        const req = get(options);

        req.setTimeout(opts.timeout, () => {
            const error = new Error('Request timed out');
            error.code = 'ETIMEDOUT';
            reject(error);
        });

        req.on('error', error => {
            LOGGER.warn('Request for %s failed: %s', url, error);
            reject(error);
        });

        req.on('response', res => {
            if (res.statusCode !== 200) {
                req.abort();

                reject(new Error(
                    `Expected HTTP 200 OK, not ${res.statusCode} ${res.statusMessage}`
                ));

                return;
            }

            if (!/^application\/json/.test(res.headers['content-type'])) {
                req.abort();

                reject(new Error(
                    `Expected content-type application/json, not ${res.headers['content-type']}`
                ));

                return;
            }

            let buffer = '';
            res.setEncoding('utf8');

            res.on('data', data => {
                buffer += data;

                if (buffer.length > 100 * 1024) {
                    req.abort();
                    reject(new Error('Response size exceeds 100KB'));
                }
            });

            res.on('end', () => {
                resolve(buffer);
            });
        });
    }).then(body => {
        return convert(url, JSON.parse(body));
    });
}

export function convert(id, data) {
    validate(data);

    if (data.live) data.duration = 0;

    const sources = {};

    for (let source of data.sources) {
        if (!sources.hasOwnProperty(source.quality))
            sources[source.quality] = [];

        sources[source.quality].push({
            link: source.url,
            contentType: source.contentType,
            quality: source.quality
        });
    }

    const meta = {
        direct: sources,
        textTracks: data.textTracks,
        thumbnail: data.thumbnail, // Currently ignored by Media
        live: !!data.live          // Currently ignored by Media
    };

    return new Media(id, data.title, data.duration, 'cm', meta);
}

export function validate(data) {
    if (typeof data.title !== 'string')
        throw new ValidationError('title must be a string');
    if (!data.title)
        throw new ValidationError('title must not be blank');

    if (typeof data.duration !== 'number')
        throw new ValidationError('duration must be a number');
    if (!isFinite(data.duration) || data.duration < 0)
        throw new ValidationError('duration must be a non-negative finite number');

    if (data.hasOwnProperty('live') && typeof data.live !== 'boolean')
        throw new ValidationError('live must be a boolean');

    if (data.hasOwnProperty('thumbnail')) {
        if (typeof data.thumbnail !== 'string')
            throw new ValidationError('thumbnail must be a string');
        validateURL(data.thumbnail);
    }

    validateSources(data.sources, data);
    validateTextTracks(data.textTracks);
}

function validateSources(sources, data) {
    if (!Array.isArray(sources))
        throw new ValidationError('sources must be a list');
    if (sources.length === 0)
        throw new ValidationError('source list must be nonempty');

    for (let source of sources) {
        if (typeof source.url !== 'string')
            throw new ValidationError('source URL must be a string');
        validateURL(source.url);

        if (!SOURCE_CONTENT_TYPES.has(source.contentType))
            throw new ValidationError(
                `unacceptable source contentType "${source.contentType}"`
            );

        if (LIVE_ONLY_CONTENT_TYPES.has(source.contentType) && !data.live)
            throw new ValidationError(
                `contentType "${source.contentType}" requires live: true`
            );

        if (!SOURCE_QUALITIES.has(source.quality))
            throw new ValidationError(`unacceptable source quality "${source.quality}"`);

        if (source.hasOwnProperty('bitrate')) {
            if (typeof source.bitrate !== 'number')
                throw new ValidationError('source bitrate must be a number');
            if (!isFinite(source.bitrate) || source.bitrate < 0)
                throw new ValidationError(
                    'source bitrate must be a non-negative finite number'
                );
        }
    }
}

function validateTextTracks(textTracks) {
    if (typeof textTracks === 'undefined') {
        return;
    }

    if (!Array.isArray(textTracks))
        throw new ValidationError('textTracks must be a list');

    let default_count = 0;
    for (let track of textTracks) {
        if (typeof track.url !== 'string')
            throw new ValidationError('text track URL must be a string');
        validateURL(track.url);

        if (track.contentType !== 'text/vtt')
            throw new ValidationError(
                `unacceptable text track contentType "${track.contentType}"`
            );

        if (typeof track.name !== 'string')
            throw new ValidationError('text track name must be a string');
        if (!track.name)
            throw new ValidationError('text track name must be nonempty');

        if (typeof track.default !== 'undefined') {
            if (default_count > 0)
                throw new ValidationError('only one default text track is allowed');
            else if (typeof track.default !== 'boolean' || track.default !== true)
                throw new ValidationError('text default attribute must be set to boolean true');
            else
                default_count++;
        }
    }
}

function parseURL(urlstring) {
    const url = urlParse(urlstring);

    // legacy url.parse doesn't check this
    if (url.protocol == null || url.host == null) {
        throw new Error(`Invalid URL "${urlstring}"`);
    }

    return url;
}

function validateURL(urlstring) {
    let url;
    try {
        url = parseURL(urlstring);
    } catch (error) {
        throw new ValidationError(`invalid URL "${urlstring}"`);
    }

    if (url.protocol !== 'https:')
        throw new ValidationError(`URL protocol must be HTTPS (invalid: "${urlstring}")`);

    if (net.isIP(url.hostname))
        throw new ValidationError(
            'URL hostname must be a domain name, not an IP address'
            + ` (invalid: "${urlstring}")`
        );
}
