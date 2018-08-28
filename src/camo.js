import crypto from 'crypto';
import * as urlparse from 'url';

const LOGGER = require('@calzoneman/jsli')('camo');

function isWhitelisted(camoConfig, url) {
    const whitelistedDomains = camoConfig.getWhitelistedDomainsRegexp();
    const parsed = urlparse.parse(url);
    return whitelistedDomains.test('.' + parsed.hostname);
}

export function camoify(camoConfig, url) {
    if (typeof url !== 'string') {
        throw new TypeError(`camoify expected a string, not [${url}]`);
    }

    if (isWhitelisted(camoConfig, url)) {
        return url.replace(/^http:/, 'https:');
    }

    const hmac = crypto.createHmac('sha1', camoConfig.getKey());
    hmac.update(url);
    const digest = hmac.digest('hex');
    // https://github.com/atmos/camo#url-formats
    if (camoConfig.getEncoding() === 'hex') {
        const hexUrl = Buffer.from(url, 'utf8').toString('hex');
        return `${camoConfig.getServer()}/${digest}/${hexUrl}`;
    } else {
        const encoded = encodeURIComponent(url);
        return `${camoConfig.getServer()}/${digest}?url=${encoded}`;
    }
}

export function transformImgTags(camoConfig, tagName, attribs) {
    if (typeof attribs.src === 'string') {
        try {
            const oldSrc = attribs.src;
            attribs.src = camoify(camoConfig, attribs.src);
            LOGGER.debug('Camoified "%s" to "%s"', oldSrc, attribs.src);
        } catch (error) {
            LOGGER.error(`Failed to generate camo URL for "${attribs.src}": ${error}`);
        }
    }

    return { tagName, attribs };
}
