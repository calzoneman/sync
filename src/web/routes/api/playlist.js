const express = require('express');
const { botAuth, requireRank, getLoadedChannel } = require('./middleware');
const util = require('../../../utilities');

const router = express.Router({ mergeParams: true });

function liveChannel(req, res) {
    const chan = getLoadedChannel(req.params.channel);
    if (!chan) {
        res.status(503).json({ error: 'Channel is not currently active' });
        return null;
    }
    return chan;
}

function makeBotProxy(bot) {
    const rank = bot.rank;
    const syncErrors = [];

    return {
        effectiveRank: rank,
        account: { effectiveRank: rank },
        getName: () => bot.name,
        getLowerName: () => bot.name.toLowerCase(),
        is: () => true,
        isAnonymous: () => false,
        queueLimiter: util.newRateLimiter(),
        socket: {
            emit: (event, data) => {
                if (event === 'queueFail') {
                    syncErrors.push((data && data.msg) || 'Queue failed');
                }
            }
        },
        _syncErrors: syncErrors
    };
}

router.get('/', botAuth, (req, res) => {
    const chan = liveChannel(req, res);
    if (!chan) return;

    const pl = chan.modules.playlist;
    const arr = pl.items.toArray(true);
    const currentUid = pl.current ? pl.current.uid : null;
    const currentIndex = currentUid !== null
        ? arr.findIndex(i => i.uid === currentUid)
        : -1;

    const items = arr.map(item => ({
        uid: item.uid,
        id: item.media.id,
        type: item.media.type,
        title: item.media.title,
        seconds: item.media.seconds,
        duration: item.media.duration,
        thumb: item.media.thumb,
        meta: item.media.meta
    }));

    res.json({
        items,
        currentIndex,
        locked: !chan.modules.permissions.openPlaylist
    });
});

// Returns 202 Accepted because queueStandard is async (semaphore + media lookup).
// Sync permission failures are captured and returned as 400.
router.post('/', botAuth, requireRank(2), (req, res) => {
    const chan = liveChannel(req, res);
    if (!chan) return;

    const { id, type, pos } = req.body;
    if (!id || !type) return res.status(400).json({ error: 'id and type are required' });

    const proxy = makeBotProxy(req.bot);
    chan.modules.playlist.handleQueue(proxy, {
        id,
        type,
        pos: pos === 'next' ? 'next' : 'end'
    });

    if (proxy._syncErrors.length > 0) {
        return res.status(400).json({ error: proxy._syncErrors[0] });
    }

    res.status(202).json({ success: true });
});

router.delete('/:uid', botAuth, requireRank(3), (req, res) => {
    const chan = liveChannel(req, res);
    if (!chan) return;

    const uid = parseInt(req.params.uid, 10);
    if (isNaN(uid)) return res.status(400).json({ error: 'Invalid uid' });

    const item = chan.modules.playlist.items.find(uid);
    if (!item) return res.status(404).json({ error: 'Playlist item not found' });

    const proxy = makeBotProxy(req.bot);
    chan.modules.playlist.handleDelete(proxy, uid);
    res.json({ success: true });
});

router.put('/playing', botAuth, requireRank(2), (req, res) => {
    const chan = liveChannel(req, res);
    if (!chan) return;

    const { uid } = req.body;
    if (uid === undefined) return res.status(400).json({ error: 'uid is required' });

    const parsed = parseInt(uid, 10);
    const item = chan.modules.playlist.items.find(parsed);
    if (!item) return res.status(404).json({ error: 'Playlist item not found' });

    const proxy = makeBotProxy(req.bot);
    chan.modules.playlist.handleJumpTo(proxy, parsed);
    res.json({ success: true });
});

router.post('/shuffle', botAuth, requireRank(3), (req, res) => {
    const chan = liveChannel(req, res);
    if (!chan) return;

    const proxy = makeBotProxy(req.bot);
    chan.modules.playlist.handleShuffle(proxy);
    res.json({ success: true });
});

router.post('/clear', botAuth, requireRank(3), (req, res) => {
    const chan = liveChannel(req, res);
    if (!chan) return;

    const proxy = makeBotProxy(req.bot);
    chan.modules.playlist.handleClear(proxy);
    res.json({ success: true });
});

module.exports = router;
