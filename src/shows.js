const LOGGER = require('@calzoneman/jsli')('shows');
const util = require('./utilities');
const showDB = require('./database/shows');
const Server = require('./server');

function makeSystemProxy(name) {
    const rank = 5;
    return {
        effectiveRank: rank,
        account: { effectiveRank: rank },
        getName: () => name,
        getLowerName: () => name.toLowerCase(),
        is: () => true,
        isAnonymous: () => false,
        queueLimiter: util.newRateLimiter(),
        socket: {
            emit: () => {}
        }
    };
}

function computeNextRunAt(show) {
    const base = Number(show.next_run_at || show.scheduled_for || Date.now());
    if (show.recurrence === 'daily') {
        return base + 24 * 60 * 60 * 1000;
    }

    if (show.recurrence === 'weekly') {
        return base + 7 * 24 * 60 * 60 * 1000;
    }

    return base;
}

function normalizePlaylist(rawPlaylist) {
    if (!Array.isArray(rawPlaylist)) return [];
    return rawPlaylist
        .map(item => ({
            id: item && item.id ? String(item.id).trim() : '',
            type: item && item.type ? String(item.type).trim() : '',
            pos: item && item.pos === 'next' ? 'next' : 'end'
        }))
        .filter(item => item.id && item.type);
}

function applyShowToChannel(chan, show) {
    const playlist = normalizePlaylist(show.playlist);
    if (playlist.length === 0) {
        throw new Error('Show playlist is empty');
    }

    const plmod = chan.modules.playlist;

    if (show.conflict_mode === 'skip' && plmod.items.length > 0) {
        throw new Error('Conflict mode is skip and playlist is not empty');
    }

    const actorName = '[show:' + show.id + ']';
    const proxy = makeSystemProxy(actorName);

    if (show.fill_mode === 'replace') {
        plmod.handleClear(proxy);
    }

    playlist.forEach((entry, idx) => {
        plmod.handleQueue(proxy, {
            id: entry.id,
            type: entry.type,
            pos: idx === 0 && entry.pos === 'next' ? 'next' : 'end'
        });
    });

    if (show.start_playback) {
        const first = plmod.items.first;
        if (first) {
            plmod.handleJumpTo(proxy, first.uid);
        }
    }
}

async function runShow(show) {
    const server = Server.getServer();
    if (!server || !server.isChannelLoaded(show.channel_name)) {
        throw new Error('Channel is not currently active');
    }

    const chan = server.getChannel(show.channel_name);
    applyShowToChannel(chan, show);
}

async function pollAndRunDueShows() {
    const due = await showDB.claimDueShows(20);
    for (const show of due) {
        try {
            await runShow(show);
            const nextRun = computeNextRunAt(show);
            await showDB.completeRun({
                id: show.id,
                recurrence: show.recurrence,
                nextRunAt: nextRun,
                updatedBy: '[scheduler]'
            });
            LOGGER.info('Executed show %s on channel %s', show.id, show.channel_name);
        } catch (error) {
            await showDB.failRun({
                id: show.id,
                updatedBy: '[scheduler]',
                error: error.message || 'Unknown execution error'
            });
            LOGGER.error('Failed to execute show %s: %s', show.id, error.stack || error.message || error);
        }
    }
}

module.exports = {
    pollAndRunDueShows,
    runShow,
    computeNextRunAt
};
