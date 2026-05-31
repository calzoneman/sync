const express = require('express');
const csrf = require('../../csrf');
const LOGGER = require('@calzoneman/jsli')('web/api/csrf');

const router = express.Router();

function isMutatingMethod(method) {
    return method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE';
}

function hasBotBearerToken(req) {
    const authHeader = req.headers && req.headers.authorization;
    return typeof authHeader === 'string' && /^Bearer\s+cbt_/.test(authHeader);
}

function hasSameOriginHeaders(req) {
    const host = req.header('host');
    if (!host) {
        return false;
    }

    const origin = req.header('origin');
    if (typeof origin === 'string' && origin.length > 0) {
        return origin.indexOf('://' + host) !== -1;
    }

    const referer = req.header('referer');
    if (typeof referer === 'string' && referer.length > 0) {
        return referer.indexOf('://' + host + '/') !== -1 || referer.endsWith('://' + host);
    }

    return false;
}

function canUseXHRCompatFallback(req) {
    const xhrHeader = String(req.header('x-requested-with') || '');
    return xhrHeader.toLowerCase() === 'xmlhttprequest' &&
        Boolean(req.signedCookies && req.signedCookies._csrf) &&
        hasSameOriginHeaders(req);
}

router.use((req, res, next) => {
    if (!isMutatingMethod(req.method) || hasBotBearerToken(req)) {
        return next();
    }

    try {
        csrf.verify(req);
        next();
    } catch (_err) {
        if (canUseXHRCompatFallback(req)) {
            LOGGER.warn(
                'CSRF compat fallback accepted %s %s',
                req.method,
                req.originalUrl || req.url
            );
            return next();
        }

        LOGGER.warn(
            'CSRF reject %s %s authHeader=%s csrfHeader=%s bodyToken=%s queryToken=%s signedCsrfCookie=%s rawCookieHasCsrf=%s',
            req.method,
            req.originalUrl || req.url,
            Boolean(req.headers && req.headers.authorization),
            Boolean(req.header('x-csrf-token')),
            Boolean(req.body && req.body._csrf),
            Boolean(req.query && req.query._csrf),
            Boolean(req.signedCookies && req.signedCookies._csrf),
            Boolean(req.headers && req.headers.cookie && req.headers.cookie.indexOf('_csrf=') !== -1)
        );
        return res.status(403).json({ error: 'Invalid CSRF token' });
    }
});

router.use('/channels/:channel/bots', require('./bots'));
router.use('/channels/:channel/emotes', require('./emotes'));
router.use('/channels/:channel/playlist', require('./playlist'));
router.use('/channels/:channel/settings', require('./settings'));
router.use('/channels/:channel/shows', require('./shows'));
router.use('/channels/:channel', require('./moderation'));

module.exports = router;
