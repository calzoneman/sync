const express = require('express');
const webserver = require('../../webserver');
const botDB = require('../../../database/bots');
const botSocketRegistry = require('../../../bot-socket-registry');
const { getChannelRow, getUserEffectiveRank, hashToken, generateToken } = require('./middleware');

const router = express.Router({ mergeParams: true });

router.get('/', async (req, res) => {
    const user = await webserver.authorize(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    let channelRow;
    try {
        channelRow = await getChannelRow(req.params.channel);
    } catch (_err) {
        return res.status(404).json({ error: 'Channel not found' });
    }

    const rank = await getUserEffectiveRank(user, channelRow);
    if (rank < 2) return res.status(403).json({ error: 'Insufficient rank' });

    const bots = await botDB.listBots(channelRow.id);
    res.json(bots);
});

router.post('/', async (req, res) => {
    const user = await webserver.authorize(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    let channelRow;
    try {
        channelRow = await getChannelRow(req.params.channel);
    } catch (_err) {
        return res.status(404).json({ error: 'Channel not found' });
    }

    const issuerRank = await getUserEffectiveRank(user, channelRow);
    if (issuerRank < 2) return res.status(403).json({ error: 'Insufficient rank' });

    const { name, rank } = req.body;
    if (!name || typeof name !== 'string' || !/^[a-zA-Z0-9_-]{1,20}$/.test(name)) {
        return res.status(400).json({ error: 'Bot name must be 1-20 alphanumeric/dash/underscore characters' });
    }

    const desiredRank = parseInt(rank, 10);
    if (isNaN(desiredRank) || desiredRank < 1 || desiredRank > issuerRank) {
        return res.status(400).json({ error: `Rank must be between 1 and ${issuerRank}` });
    }

    const token = generateToken();
    const tokenHash = hashToken(token);

    const botId = await botDB.createBot({
        channelId: channelRow.id,
        name,
        tokenHash,
        rank: desiredRank,
        createdBy: user.name
    });

    res.status(201).json({ id: botId, name, rank: desiredRank, token });
});

router.delete('/:id', async (req, res) => {
    const user = await webserver.authorize(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    let channelRow;
    try {
        channelRow = await getChannelRow(req.params.channel);
    } catch (_err) {
        return res.status(404).json({ error: 'Channel not found' });
    }

    const issuerRank = await getUserEffectiveRank(user, channelRow);
    if (issuerRank < 2) return res.status(403).json({ error: 'Insufficient rank' });

    const botId = parseInt(req.params.id, 10);
    if (isNaN(botId)) return res.status(400).json({ error: 'Invalid bot id' });

    const bot = await botDB.getBotById(botId, channelRow.id);
    if (!bot) return res.status(404).json({ error: 'Bot not found' });
    if (bot.rank > issuerRank) return res.status(403).json({ error: 'Cannot revoke a bot with higher rank than your own' });

    await botDB.revokeBot(botId, channelRow.id);
    botSocketRegistry.disconnect(botId);

    res.json({ success: true });
});

module.exports = router;
