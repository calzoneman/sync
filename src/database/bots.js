const db = require('../database');

function knex() {
    return db.getDB().knex;
}

async function createBot({ channelId, name, tokenHash, rank, createdBy }) {
    const [id] = await knex()('channel_bots').insert({
        channel_id: channelId,
        name,
        token_hash: tokenHash,
        rank,
        created_by: createdBy,
        created_at: Date.now(),
        active: true,
        last_connected: null
    });
    return id;
}

async function getBotByTokenHash(tokenHash) {
    const rows = await knex()('channel_bots')
        .join('channels', 'channel_bots.channel_id', 'channels.id')
        .where({ token_hash: tokenHash, active: true })
        .select('channel_bots.*', 'channels.name as channel_name');
    return rows[0] || null;
}

async function getBotById(id, channelId) {
    const rows = await knex()('channel_bots')
        .where({ id, channel_id: channelId })
        .select();
    return rows[0] || null;
}

async function listBots(channelId) {
    return knex()('channel_bots')
        .where({ channel_id: channelId })
        .orderBy('created_at', 'desc')
        .select('id', 'name', 'rank', 'created_by', 'created_at', 'active', 'last_connected');
}

async function revokeBot(id, channelId) {
    await knex()('channel_bots')
        .where({ id, channel_id: channelId })
        .update({ active: false });
}

async function updateLastConnected(id) {
    await knex()('channel_bots')
        .where({ id })
        .update({ last_connected: Date.now() });
}

module.exports = { createBot, getBotByTokenHash, getBotById, listBots, revokeBot, updateLastConnected };
