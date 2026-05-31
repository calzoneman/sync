const LOGGER = require('@calzoneman/jsli')('shows');
const util = require('./utilities');
const showDB = require('./database/shows');
const Server = require('./server');
const InfoGetter = require('./get-info');

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
    const recurrence = show.recurrence;
    const timezone = show.timezone || 'UTC';

    if (recurrence !== 'daily' && recurrence !== 'weekly') {
        return base;
    }

    const daysToAdd = recurrence === 'weekly' ? 7 : 1;
    const source = new Date(base);
    const local = toZonedParts(source, timezone);
    if (!local) {
        return base + (daysToAdd * 24 * 60 * 60 * 1000);
    }

    const targetDate = addDaysUTC(local.year, local.month, local.day, daysToAdd);
    const zonedTarget = {
        year: targetDate.year,
        month: targetDate.month,
        day: targetDate.day,
        hour: local.hour,
        minute: local.minute,
        second: local.second
    };

    const next = zonedDateTimeToUtc(zonedTarget, timezone);
    return next || (base + (daysToAdd * 24 * 60 * 60 * 1000));
}

function toZonedParts(date, timezone) {
    try {
        const dtf = new Intl.DateTimeFormat('en-US', {
            timeZone: timezone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        });
        const parts = dtf.formatToParts(date);
        const out = {};
        for (const part of parts) {
            if (part.type === 'literal') continue;
            out[part.type] = parseInt(part.value, 10);
        }

        return {
            year: out.year,
            month: out.month,
            day: out.day,
            hour: out.hour,
            minute: out.minute,
            second: out.second
        };
    } catch (_err) {
        return null;
    }
}

function addDaysUTC(year, month, day, days) {
    const d = new Date(Date.UTC(year, month - 1, day + days));
    return {
        year: d.getUTCFullYear(),
        month: d.getUTCMonth() + 1,
        day: d.getUTCDate()
    };
}

function zonedDateTimeToUtc(local, timezone) {
    let guess = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second);

    // Iterate to resolve timezone offset for the target wall-clock time (handles DST shifts).
    for (let i = 0; i < 4; i++) {
        const zoned = toZonedParts(new Date(guess), timezone);
        if (!zoned) return null;

        const desired = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second);
        const current = Date.UTC(zoned.year, zoned.month - 1, zoned.day, zoned.hour, zoned.minute, zoned.second);
        const delta = desired - current;
        if (delta === 0) {
            return guess;
        }
        guess += delta;
    }

    return guess;
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

function queueShowEntry(plmod, proxy, entry, idx) {
    return new Promise((resolve, reject) => {
        let data = {
            id: entry.id,
            type: entry.type,
            pos: idx === 0 && entry.pos === 'next' ? 'next' : 'end',
            title: false,
            link: util.formatLink(entry.id, entry.type, null),
            temp: true,
            shouldAddToLibrary: true,
            queueby: proxy.getName(),
            duration: undefined,
            maxlength: 0
        };

        InfoGetter.getMedia(entry.id, entry.type, (err, media) => {
            if (err) {
                reject(new Error(String(err)));
                return;
            }

            if (Array.isArray(media)) {
                let list = media.slice();
                if (data.pos === 'next') {
                    list = list.reverse();
                    if (plmod.items.length === 0 && list.length > 0) {
                        list.unshift(list.pop());
                    }
                }

                if (list.length === 0) {
                    reject(new Error(`Show item resolved to an empty playlist: ${entry.type}:${entry.id}`));
                    return;
                }

                let firstUid = null;
                let pending = list.length;
                let failed = false;
                list.forEach((video) => {
                    const beforeUid = plmod._nextuid;
                    const itemData = Object.assign({}, data, {
                        id: video.id,
                        type: video.type,
                        link: util.formatLink(video.id, video.type, video.meta || null)
                    });

                    plmod._addItem(video, itemData, proxy, () => {
                        if (failed) {
                            return;
                        }

                        if (plmod._nextuid === beforeUid) {
                            failed = true;
                            reject(new Error(`Failed to add show list item: ${entry.type}:${entry.id}`));
                            return;
                        }

                        if (firstUid === null) {
                            firstUid = beforeUid;
                        }

                        pending -= 1;
                        if (pending === 0) {
                            resolve(firstUid);
                        }
                    });
                });
                return;
            }

            const beforeUid = plmod._nextuid;
            plmod._addItem(media, data, proxy, () => {
                if (plmod._nextuid === beforeUid) {
                    reject(new Error(`Failed to add show item: ${entry.type}:${entry.id}`));
                    return;
                }

                resolve(beforeUid);
            });
        });
    });
}

async function applyShowToChannel(chan, show) {
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

    const addedUids = [];
    for (let i = 0; i < playlist.length; i++) {
        const uid = await queueShowEntry(plmod, proxy, playlist[i], i);
        addedUids.push(uid);
    }

    if (show.start_playback) {
        const firstShowUid = addedUids[0];
        if (typeof firstShowUid === 'number') {
            plmod.handleJumpTo(proxy, firstShowUid);
        }
    }
}

async function runShow(show) {
    const server = Server.getServer();
    if (!server || !server.isChannelLoaded(show.channel_name)) {
        throw new Error('Channel is not currently active');
    }

    const chan = server.getChannel(show.channel_name);
    await applyShowToChannel(chan, show);
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
