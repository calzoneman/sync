const express = require('express');

const router = express.Router();

router.use('/channels/:channel/bots', require('./bots'));
router.use('/channels/:channel/emotes', require('./emotes'));
router.use('/channels/:channel/playlist', require('./playlist'));
router.use('/channels/:channel/settings', require('./settings'));
router.use('/channels/:channel/shows', require('./shows'));
router.use('/channels/:channel', require('./moderation'));

module.exports = router;
