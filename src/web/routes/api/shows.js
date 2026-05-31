const express = require('express');
const webserver = require('../../webserver');
const showDB = require('../../../database/shows');
const shows = require('../../../shows');
const botDB = require('../../../database/bots');
const infoGetter = require('../../../get-info');
const { getChannelRow, getUserEffectiveRank, hashToken } = require('./middleware');

const router = express.Router({ mergeParams: true });

const SHOW_STATUSES = new Set(['draft', 'scheduled', 'paused', 'running', 'completed', 'failed', 'canceled']);
const RECURRENCES = new Set(['none', 'daily', 'weekly']);
const FILL_MODES = new Set(['append', 'replace']);
const CONFLICT_MODES = new Set(['force', 'skip']);
const ACTION_MIN_RANK = {
    pause: 2,
    resume: 2,
    schedule: 2,
    run: 3,
    cancel: 3
};
const PUBLIC_SHOW_STATUSES = new Set(['scheduled', 'running', 'paused', 'completed']);

function sanitizePlaylist(list) {
    if (!Array.isArray(list)) return [];
    return list
        .map(item => ({
            id: item && item.id ? String(item.id).trim() : '',
            type: item && item.type ? String(item.type).trim() : '',
            pos: item && item.pos === 'next' ? 'next' : 'end'
        }))
        .filter(item => item.id && item.type);
}

function parseSchedule(input) {
    const ms = Date.parse(input);
    if (isNaN(ms)) return null;
    return ms;
}

function isValidTimeZone(tz) {
    if (!tz || typeof tz !== 'string') return false;
    try {
        Intl.DateTimeFormat('en-US', { timeZone: tz }).format(new Date());
        return true;
    } catch (_err) {
        return false;
    }
}

function validateShowPayload(body, old = null) {
    const name = (body.name || (old && old.name) || '').trim();
    if (!name || name.length > 100) {
        return { error: 'Show name must be 1-100 characters' };
    }

    const playlist = body.playlist !== undefined ? sanitizePlaylist(body.playlist) : (old ? old.playlist : []);
    if (!Array.isArray(playlist) || playlist.length === 0) {
        return { error: 'Show playlist must contain at least one item' };
    }

    const timezone = String(body.timezone || (old && old.timezone) || 'UTC').trim();
    if (!isValidTimeZone(timezone)) {
        return { error: 'timezone must be a valid IANA time zone string' };
    }
    const scheduledInput = body.scheduled_for !== undefined ? body.scheduled_for : (old ? old.scheduled_for : null);
    const scheduledFor = typeof scheduledInput === 'number' ? scheduledInput : parseSchedule(scheduledInput);
    if (!scheduledFor) {
        return { error: 'scheduled_for must be a valid date or timestamp' };
    }

    const recurrence = String(body.recurrence || (old && old.recurrence) || 'none');
    if (!RECURRENCES.has(recurrence)) {
        return { error: 'Invalid recurrence' };
    }

    const fillMode = String(body.fill_mode || (old && old.fill_mode) || 'append');
    if (!FILL_MODES.has(fillMode)) {
        return { error: 'Invalid fill_mode' };
    }

    const conflictMode = String(body.conflict_mode || (old && old.conflict_mode) || 'force');
    if (!CONFLICT_MODES.has(conflictMode)) {
        return { error: 'Invalid conflict_mode' };
    }

    const startPlayback = body.start_playback !== undefined
        ? !!body.start_playback
        : old
            ? !!old.start_playback
            : false;

    let status = String(body.status || (old && old.status) || 'scheduled');
    if (!SHOW_STATUSES.has(status)) {
        return { error: 'Invalid status' };
    }

    if (status === 'running') {
        status = 'scheduled';
    }

    const nextRunAt = status === 'scheduled' ? scheduledFor : (old ? old.next_run_at : scheduledFor);

    return {
        value: {
            name,
            playlist,
            timezone,
            scheduled_for: scheduledFor,
            next_run_at: nextRunAt,
            status,
            recurrence,
            recurrence_meta: null,
            fill_mode: fillMode,
            conflict_mode: conflictMode,
            start_playback: startPlayback
        }
    };
}

async function authorizeChannel(req, res) {
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.slice(7).trim();
        if (!token.startsWith('cbt_')) {
            res.status(401).json({ error: 'Invalid token format' });
            return null;
        }

        const tokenHash = hashToken(token);
        const bot = await botDB.getBotByTokenHash(tokenHash);
        if (!bot) {
            res.status(401).json({ error: 'Invalid or revoked token' });
            return null;
        }

        if (bot.channel_name.toLowerCase() !== req.params.channel.toLowerCase()) {
            res.status(403).json({ error: 'Token not authorized for this channel' });
            return null;
        }

        if (bot.rank < 2) {
            res.status(403).json({ error: 'Insufficient rank' });
            return null;
        }

        return {
            actorName: bot.name,
            rank: bot.rank,
            channelRow: { id: bot.channel_id, name: bot.channel_name }
        };
    }

    const user = await webserver.authorize(req);
    if (!user) {
        res.status(401).json({ error: 'Unauthorized' });
        return null;
    }

    let channelRow;
    try {
        channelRow = await getChannelRow(req.params.channel);
    } catch (_err) {
        res.status(404).json({ error: 'Channel not found' });
        return null;
    }

    const rank = await getUserEffectiveRank(user, channelRow);
    if (rank < 2) {
        res.status(403).json({ error: 'Insufficient rank' });
        return null;
    }

    return { user, actorName: user.name, channelRow, rank };
}

router.get('/', async (req, res) => {
    const auth = await authorizeChannel(req, res);
    if (!auth) return;

    const showsList = await showDB.listShows(auth.channelRow.id);
    res.json(showsList);
});

router.get('/public', async (req, res) => {
    let channelRow;
    try {
        channelRow = await getChannelRow(req.params.channel);
    } catch (_err) {
        return res.status(404).json({ error: 'Channel not found' });
    }

    const showsList = await showDB.listShows(channelRow.id);
    res.json(showsList.filter(show => PUBLIC_SHOW_STATUSES.has(show.status)));
});

router.get('/:id', async (req, res) => {
    const auth = await authorizeChannel(req, res);
    if (!auth) return;

    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid show id' });
    const show = await showDB.getShowById(id, auth.channelRow.id);
    if (!show) return res.status(404).json({ error: 'Show not found' });
    res.json(show);
});

router.post('/resolve-media', async (req, res) => {
    const auth = await authorizeChannel(req, res);
    if (!auth) return;

    const items = Array.isArray(req.body && req.body.items) ? req.body.items : [];
    if (items.length === 0) {
        return res.json({ items: [] });
    }

    const capped = items.slice(0, 50).map(item => ({
        id: item && item.id ? String(item.id).trim() : '',
        type: item && item.type ? String(item.type).trim() : ''
    })).filter(item => item.id && item.type);

    const resolved = await Promise.all(capped.map(item => {
        return new Promise(resolve => {
            infoGetter.getMedia(item.id, item.type, (err, media) => {
                if (err || !media) {
                    resolve({
                        id: item.id,
                        type: item.type,
                        title: item.id,
                        ok: false
                    });
                    return;
                }

                resolve({
                    id: item.id,
                    type: item.type,
                    title: media.title || item.id,
                    ok: true
                });
            });
        });
    }));

    res.json({ items: resolved });
});

router.post('/', async (req, res) => {
    const auth = await authorizeChannel(req, res);
    if (!auth) return;

    const validated = validateShowPayload(req.body || null);
    if (validated.error) return res.status(400).json({ error: validated.error });

    const id = await showDB.createShow({
        channelId: auth.channelRow.id,
        createdBy: auth.actorName,
        input: validated.value
    });

    const row = await showDB.getShowById(id, auth.channelRow.id);
    res.status(201).json(row);
});

router.put('/:id', async (req, res) => {
    const auth = await authorizeChannel(req, res);
    if (!auth) return;

    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid show id' });

    const current = await showDB.getShowById(id, auth.channelRow.id);
    if (!current) return res.status(404).json({ error: 'Show not found' });

    const validated = validateShowPayload(req.body || {}, current);
    if (validated.error) return res.status(400).json({ error: validated.error });

    await showDB.updateShow({
        id,
        channelId: auth.channelRow.id,
        input: {
            ...validated.value,
            updated_by: auth.actorName
        }
    });

    const row = await showDB.getShowById(id, auth.channelRow.id);
    res.json(row);
});

router.delete('/:id', async (req, res) => {
    const auth = await authorizeChannel(req, res);
    if (!auth) return;
    if (auth.rank < 3) return res.status(403).json({ error: 'Insufficient rank' });

    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid show id' });

    const current = await showDB.getShowById(id, auth.channelRow.id);
    if (!current) return res.status(404).json({ error: 'Show not found' });

    await showDB.deleteShow(id, auth.channelRow.id);
    res.json({ success: true });
});

router.post('/:id/action', async (req, res) => {
    const auth = await authorizeChannel(req, res);
    if (!auth) return;

    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid show id' });

    const show = await showDB.getShowById(id, auth.channelRow.id);
    if (!show) return res.status(404).json({ error: 'Show not found' });

    const action = String((req.body && req.body.action) || '').toLowerCase();
    if (!action) return res.status(400).json({ error: 'action is required' });
    if (!ACTION_MIN_RANK[action]) return res.status(400).json({ error: 'Unknown action' });
    if (auth.rank < ACTION_MIN_RANK[action]) return res.status(403).json({ error: 'Insufficient rank' });

    if (action === 'pause') {
        await showDB.updateShowStatus({
            id,
            channelId: auth.channelRow.id,
            status: 'paused',
            updatedBy: auth.actorName
        });
    } else if (action === 'resume') {
        await showDB.updateShow({
            id,
            channelId: auth.channelRow.id,
            input: {
                ...show,
                status: 'scheduled',
                next_run_at: Date.now(),
                updated_by: auth.actorName
            }
        });
    } else if (action === 'cancel') {
        await showDB.updateShowStatus({
            id,
            channelId: auth.channelRow.id,
            status: 'canceled',
            updatedBy: auth.actorName
        });
    } else if (action === 'run') {
        try {
            const forced = {
                ...show,
                channel_name: auth.channelRow.name,
                id
            };
            await shows.runShow(forced);
            const nextRun = shows.computeNextRunAt(forced);
            await showDB.completeRun({
                id,
                recurrence: show.recurrence,
                nextRunAt: nextRun,
                updatedBy: auth.actorName
            });
        } catch (error) {
            return res.status(400).json({ error: error.message || 'Failed to execute show' });
        }
    } else if (action === 'schedule') {
        await showDB.updateShow({
            id,
            channelId: auth.channelRow.id,
            input: {
                ...show,
                status: 'scheduled',
                next_run_at: show.scheduled_for,
                updated_by: auth.actorName
            }
        });
    }

    const row = await showDB.getShowById(id, auth.channelRow.id);
    res.json(row);
});

module.exports = router;
