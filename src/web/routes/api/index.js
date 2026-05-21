const express = require('express');
const csrf = require('../../csrf');

const router = express.Router();

function isMutatingMethod(method) {
    return method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE';
}

function hasBotBearerToken(req) {
    const authHeader = req.headers && req.headers.authorization;
    return typeof authHeader === 'string' && /^Bearer\s+cbt_/.test(authHeader);
}

router.use((req, res, next) => {
    if (!isMutatingMethod(req.method) || hasBotBearerToken(req)) {
        return next();
    }

    try {
        csrf.verify(req);
        next();
    } catch (_err) {
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
