const express = require('express');
const db = require('../../../database');
const { botAuth, requireRank, getLoadedChannel } = require('./middleware');

const router = express.Router({ mergeParams: true });

router.get('/users', botAuth, (req, res) => {
    const chan = getLoadedChannel(req.params.channel);
    if (!chan) return res.status(503).json({ error: 'Channel is not currently active' });

    const users = chan.users.map(u => ({
        name: u.getName(),
        rank: u.account.effectiveRank,
        afk: u.is(0x4),
        is_bot: Boolean(u.socket.context.user && u.socket.context.user.isBot)
    }));
    res.json(users);
});

router.post('/users/:name/kick', botAuth, requireRank(2), (req, res) => {
    const chan = getLoadedChannel(req.params.channel);
    if (!chan) return res.status(503).json({ error: 'Channel is not currently active' });

    const targetName = req.params.name.toLowerCase();
    const reason = (req.body && req.body.reason) ? String(req.body.reason) : 'Kicked by bot';

    const target = chan.users.find(u => u.getLowerName() === targetName);
    if (!target) return res.status(404).json({ error: 'User not found' });
    if (target.account.effectiveRank >= req.bot.rank) {
        return res.status(403).json({ error: 'Cannot kick a user with equal or higher rank' });
    }

    target.kick(reason);
    res.json({ success: true });
});

router.post('/users/:name/ban', botAuth, requireRank(3), async (req, res) => {
    const chan = getLoadedChannel(req.params.channel);
    if (!chan) return res.status(503).json({ error: 'Channel is not currently active' });

    const targetName = req.params.name.toLowerCase();
    const reason = (req.body && req.body.reason) ? String(req.body.reason) : 'Banned by bot';

    const target = chan.users.find(u => u.getLowerName() === targetName);
    if (target && target.account.effectiveRank >= req.bot.rank) {
        return res.status(403).json({ error: 'Cannot ban a user with equal or higher rank' });
    }

    chan.modules.kickban.ban(targetName, '', reason, req.bot.name, (err) => {
        if (err) return res.status(400).json({ error: err });
        res.json({ success: true });
    });
});

router.delete('/users/:name/ban', botAuth, requireRank(3), (req, res) => {
    const chan = getLoadedChannel(req.params.channel);
    if (!chan) return res.status(503).json({ error: 'Channel is not currently active' });

    const targetName = req.params.name.toLowerCase();

    db.channels.listBans(chan.name, (err, bans) => {
        if (err) return res.status(500).json({ error: 'Database error' });

        const entry = bans.find(b => b.name.toLowerCase() === targetName);
        if (!entry) return res.status(404).json({ error: 'Ban not found' });

        db.channels.unbanId(chan.name, entry.id, (err2) => {
            if (err2) return res.status(500).json({ error: 'Database error' });
            chan.broadcastAll('banlist', bans.filter(b => b.id !== entry.id));
            res.json({ success: true });
        });
    });
});

router.put('/users/:name/rank', botAuth, requireRank(4), async (req, res) => {
    const chan = getLoadedChannel(req.params.channel);
    if (!chan) return res.status(503).json({ error: 'Channel is not currently active' });

    const targetName = req.params.name.toLowerCase();
    const newRank = parseInt(req.body && req.body.rank, 10);

    if (isNaN(newRank) || newRank < 1) {
        return res.status(400).json({ error: 'Invalid rank' });
    }
    if (newRank >= req.bot.rank) {
        return res.status(403).json({ error: 'Cannot assign rank equal to or higher than your own' });
    }

    const target = chan.users.find(u => u.getLowerName() === targetName);
    if (!target) return res.status(404).json({ error: 'User not found in channel' });
    if (target.account.effectiveRank >= req.bot.rank) {
        return res.status(403).json({ error: 'Cannot change rank of a user with equal or higher rank' });
    }

    db.channels.setRank(chan.name, targetName, newRank, (err) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        target.setChannelRank(newRank);
        chan.broadcastAll('setUserRank', { name: target.getName(), rank: target.account.effectiveRank });
        res.json({ success: true });
    });
});

module.exports = router;
