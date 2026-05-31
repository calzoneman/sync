const db = require('../database');

function knex() {
    return db.getDB().knex;
}

function parseShowRow(row) {
    if (!row) return null;

    let playlist = [];
    let recurrenceMeta = null;
    try {
        playlist = JSON.parse(row.playlist || '[]');
    } catch (_err) {
        playlist = [];
    }

    try {
        recurrenceMeta = row.recurrence_meta ? JSON.parse(row.recurrence_meta) : null;
    } catch (_err) {
        recurrenceMeta = null;
    }

    return {
        id: row.id,
        channel_name: row.channel_name,
        channel_id: row.channel_id,
        name: row.name,
        notes: row.notes || null,
        color: row.color || null,
        playlist,
        timezone: row.timezone,
        scheduled_for: row.scheduled_for,
        next_run_at: row.next_run_at,
        status: row.status,
        recurrence: row.recurrence,
        recurrence_meta: recurrenceMeta,
        fill_mode: row.fill_mode,
        conflict_mode: row.conflict_mode,
        start_playback: !!row.start_playback,
        run_count: row.run_count,
        last_run_at: row.last_run_at,
        created_at: row.created_at,
        updated_at: row.updated_at,
        created_by: row.created_by,
        updated_by: row.updated_by,
        last_error: row.last_error
    };
}

function serializeShowInput(input) {
    return {
        name: input.name,
        notes: input.notes || null,
        color: input.color || null,
        playlist: JSON.stringify(input.playlist || []),
        timezone: input.timezone,
        scheduled_for: input.scheduled_for,
        next_run_at: input.next_run_at,
        status: input.status,
        recurrence: input.recurrence,
        recurrence_meta: input.recurrence_meta ? JSON.stringify(input.recurrence_meta) : null,
        fill_mode: input.fill_mode,
        conflict_mode: input.conflict_mode,
        start_playback: !!input.start_playback,
        last_error: input.last_error || null,
        updated_by: input.updated_by,
        updated_at: Date.now()
    };
}

async function listShows(channelId) {
    const rows = await knex()('channel_shows')
        .where({ channel_id: channelId })
        .orderBy('next_run_at', 'asc')
        .orderBy('created_at', 'desc')
        .select();
    return rows.map(parseShowRow);
}

async function getShowById(id, channelId) {
    const rows = await knex()('channel_shows')
        .where({ id, channel_id: channelId })
        .select();
    return parseShowRow(rows[0]);
}

async function createShow({ channelId, createdBy, input }) {
    const now = Date.now();
    const row = serializeShowInput({
        ...input,
        updated_by: createdBy,
        last_error: null
    });

    const [id] = await knex()('channel_shows').insert({
        channel_id: channelId,
        created_by: createdBy,
        created_at: now,
        run_count: 0,
        ...row
    });

    return id;
}

async function updateShow({ id, channelId, input }) {
    const row = serializeShowInput(input);
    await knex()('channel_shows')
        .where({ id, channel_id: channelId })
        .update(row);
}

async function deleteShow(id, channelId) {
    await knex()('channel_shows')
        .where({ id, channel_id: channelId })
        .delete();
}

async function updateShowStatus({ id, channelId, status, updatedBy, lastError = null }) {
    await knex()('channel_shows')
        .where({ id, channel_id: channelId })
        .update({
            status,
            last_error: lastError,
            updated_by: updatedBy,
            updated_at: Date.now()
        });
}

async function claimDueShows(limit = 20) {
    const now = Date.now();
    const rows = await knex()('channel_shows')
        .join('channels', 'channel_shows.channel_id', 'channels.id')
        .where({ status: 'scheduled' })
        .andWhere('next_run_at', '<=', now)
        .orderBy('channel_shows.next_run_at', 'asc')
        .limit(limit)
        .select('channel_shows.*', 'channels.name as channel_name');

    const claimed = [];
    for (const row of rows) {
        const updated = await knex()('channel_shows')
            .where({ id: row.id, status: 'scheduled' })
            .andWhere('next_run_at', '<=', now)
            .update({
                status: 'running',
                updated_at: Date.now(),
                last_error: null
            });

        if (updated > 0) {
            claimed.push(parseShowRow({ ...row, status: 'running' }));
        }
    }

    return claimed;
}

async function completeRun({ id, recurrence, nextRunAt, updatedBy }) {
    const patch = {
        status: recurrence === 'none' ? 'completed' : 'scheduled',
        next_run_at: recurrence === 'none' ? nextRunAt : nextRunAt,
        run_count: knex().raw('run_count + 1'),
        last_run_at: Date.now(),
        updated_by: updatedBy,
        updated_at: Date.now(),
        last_error: null
    };

    await knex()('channel_shows')
        .where({ id })
        .update(patch);
}

async function failRun({ id, updatedBy, error }) {
    await knex()('channel_shows')
        .where({ id })
        .update({
            status: 'failed',
            last_error: error,
            updated_by: updatedBy,
            updated_at: Date.now()
        });
}

module.exports = {
    listShows,
    getShowById,
    createShow,
    updateShow,
    deleteShow,
    updateShowStatus,
    claimDueShows,
    completeRun,
    failRun
};
