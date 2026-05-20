const express = require('express');
const { botAuth, requireRank, getLoadedChannel } = require('./middleware');

const router = express.Router({ mergeParams: true });

const ALLOWED_SETTINGS = new Set([
    'allow_voteskip', 'allow_dupes', 'voteskip_ratio', 'maxlength',
    'playlist_max_duration_per_user', 'afk_timeout', 'enable_link_regex',
    'chat_antiflood', 'chat_antiflood_burst', 'chat_antiflood_sustained',
    'new_user_chat_delay', 'new_user_chat_link_delay', 'pagetitle',
    'password', 'externalcss', 'externaljs', 'show_public', 'torbanned',
    'block_anonymous_users', 'allow_ascii_control', 'playlist_max_per_user'
]);

router.get('/', botAuth, requireRank(4), (req, res) => {
    const chan = getLoadedChannel(req.params.channel);
    if (!chan) return res.status(503).json({ error: 'Channel is not currently active' });

    const opts = chan.modules.options;
    if (!opts) return res.status(503).json({ error: 'Options module not available' });

    const out = {};
    for (const key of ALLOWED_SETTINGS) {
        out[key] = opts.get(key);
    }
    res.json(out);
});

router.put('/', botAuth, requireRank(4), (req, res) => {
    const chan = getLoadedChannel(req.params.channel);
    if (!chan) return res.status(503).json({ error: 'Channel is not currently active' });

    const opts = chan.modules.options;
    if (!opts) return res.status(503).json({ error: 'Options module not available' });

    const updates = {};
    for (const [key, value] of Object.entries(req.body)) {
        if (ALLOWED_SETTINGS.has(key)) {
            updates[key] = value;
        }
    }

    if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: 'No valid settings provided' });
    }

    opts.setOptions(updates);
    chan.broadcastAll('setOptions', opts.getOptions());

    res.json({ success: true });
});

module.exports = router;
