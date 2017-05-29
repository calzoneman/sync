// @flow
import crypto from 'crypto';
import { LoggerFactory } from '@calzoneman/jsli';
import * as urlparse from 'url';
import { CamoConfig } from './configuration/camoconfig';

const LOGGER = LoggerFactory.getLogger('camo');

function isWhitelisted(camoConfig: CamoConfig, url: string): boolean {
    const whitelistedDomains = camoConfig.getWhitelistedDomains();
    const parsed = urlparse.parse(url);
    return whitelistedDomains.includes(parsed.hostname);
}

export function camoify(camoConfig: CamoConfig, url: string): string {
    if (typeof url !== 'string') {
        throw new TypeError(`camoify expected a string, not [${url}]`);
    }

    if (isWhitelisted(camoConfig, url)) {
        return url.replace(/^http:/, 'https:');
    }

    const hmac = crypto.createHmac('sha1', camoConfig.getKey());
    hmac.update(url);
    const digest = hmac.digest('hex');
    const hexUrl = Buffer.from(url, 'utf8').toString('hex');
    return `${camoConfig.getServer()}/${digest}/${hexUrl}`;
}

export function transformImgTags(camoConfig: CamoConfig, tagName: string, attribs: Object) {
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
