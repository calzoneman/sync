import { ValidationError } from './errors';
import { URL } from 'url';
import net from 'net';

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
    'application/x-mpegURL',
    'audio/aac',
    'audio/ogg',
    'audio/mpeg',
    'video/mp4',
    'video/ogg',
    'video/webm'
]);

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

    validateSources(data.sources);
    validateTextTracks(data.textTracks);
}

function validateSources(sources) {
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
    }
}

function validateURL(urlstring) {
    let url;
    try {
        url = new URL(urlstring);
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
