const crypto = require('crypto');
const botDB = require('../../../database/bots');
const db = require('../../../database');
const Server = require('../../../server');

function hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
}

function generateToken() {
    return 'cbt_' + crypto.randomBytes(32).toString('hex');
}

async function botAuth(req, res, next) {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Missing Authorization header' });
    }

    const token = authHeader.slice(7).trim();
    if (!token.startsWith('cbt_')) {
        return res.status(401).json({ error: 'Invalid token format' });
    }

    const tokenHash = hashToken(token);
    let bot;
    try {
        bot = await botDB.getBotByTokenHash(tokenHash);
    } catch (err) {
        return res.status(500).json({ error: 'Internal error' });
    }

    if (!bot) {
        return res.status(401).json({ error: 'Invalid or revoked token' });
    }

    if (bot.channel_name.toLowerCase() !== req.params.channel.toLowerCase()) {
        return res.status(403).json({ error: 'Token not authorized for this channel' });
    }

    req.bot = bot;
    next();
}

function requireRank(minRank) {
    return (req, res, next) => {
        if (req.bot.rank < minRank) {
            return res.status(403).json({ error: `Requires rank ${minRank}, bot has rank ${req.bot.rank}` });
        }
        next();
    };
}

function getLoadedChannel(channelName) {
    const server = Server.getServer();
    if (!server.isChannelLoaded(channelName)) {
        return null;
    }
    return server.getChannel(channelName);
}

async function getChannelRow(channelName) {
    return new Promise((resolve, reject) => {
        db.channels.lookup(channelName, (err, row) => {
            if (err) reject(new Error(err));
            else resolve(row);
        });
    });
}

async function getUserEffectiveRank(user, channelRow) {
    return new Promise((resolve, reject) => {
        db.channels.getRank(channelRow.name, user.name.toLowerCase(), (err, channelRank) => {
            if (err) reject(new Error(err));
            else resolve(Math.max(user.global_rank, channelRank));
        });
    });
}

module.exports = {
    botAuth,
    requireRank,
    getLoadedChannel,
    getChannelRow,
    getUserEffectiveRank,
    hashToken,
    generateToken
};
