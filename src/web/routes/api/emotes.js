const express = require('express');
const db = require('../../../database');
const { botAuth, requireRank, getLoadedChannel } = require('./middleware');

const router = express.Router({ mergeParams: true });

const XSS = require('../../../xss');

function validateEmote(f) {
    if (typeof f.name !== 'string' || typeof f.image !== 'string') return null;
    f.image = f.image.substring(0, 1000);
    f.image = XSS.sanitizeText(f.image);
    var s = XSS.looseSanitizeText(f.name).replace(/([\\.?+*$^|()[\]{}])/g, '\\$1');
    s = '(^|\\s)' + s + '(?!\\S)';
    f.source = s;
    if (!f.image || !f.name) return null;
    try { new RegExp(f.source, 'gi'); } catch (e) { return null; }
    return f;
}

async function getChannelEmotes(channelId) {
    return new Promise((resolve, reject) => {
        db.query(
            'SELECT `value` FROM channel_data WHERE channel_id = ? AND `key` = ?',
            [channelId, 'emotes'],
            (err, rows) => {
                if (err) return reject(new Error(err));
                if (!rows || rows.length === 0) return resolve([]);
                try { resolve(JSON.parse(rows[0].value)); }
                catch (e) { resolve([]); }
            }
        );
    });
}

async function saveChannelEmotes(channelId, emotes) {
    const value = JSON.stringify(emotes);
    return new Promise((resolve, reject) => {
        db.query(
            'INSERT INTO channel_data (channel_id, `key`, `value`) VALUES (?, ?, ?) ' +
            'ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)',
            [channelId, 'emotes', value],
            (err) => {
                if (err) reject(new Error(err));
                else resolve();
            }
        );
    });
}

router.get('/', botAuth, async (req, res) => {
    const emotes = await getChannelEmotes(req.bot.channel_id);
    res.json(emotes);
});

router.post('/', botAuth, requireRank(4), async (req, res) => {
    const { name, image } = req.body;
    const validated = validateEmote({ name, image });
    if (!validated) return res.status(400).json({ error: 'Invalid emote name or image' });

    const emotes = await getChannelEmotes(req.bot.channel_id);
    if (emotes.some(e => e.name === validated.name)) {
        return res.status(409).json({ error: 'Emote already exists' });
    }

    emotes.push(validated);
    await saveChannelEmotes(req.bot.channel_id, emotes);

    const chan = getLoadedChannel(req.params.channel);
    if (chan && chan.modules.emotes) {
        chan.modules.emotes.emotes.updateEmote(validated);
        chan.modules.emotes.dirty = true;
        chan.broadcastAll('updateEmote', validated);
    }

    res.status(201).json(validated);
});

router.put('/:name', botAuth, requireRank(4), async (req, res) => {
    const emoteName = req.params.name;
    const { image, newName } = req.body;

    const emotes = await getChannelEmotes(req.bot.channel_id);
    const idx = emotes.findIndex(e => e.name === emoteName);
    if (idx === -1) return res.status(404).json({ error: 'Emote not found' });

    const updatedRaw = { name: newName || emoteName, image: image || emotes[idx].image };
    const validated = validateEmote(updatedRaw);
    if (!validated) return res.status(400).json({ error: 'Invalid emote data' });

    if (validated.name !== emoteName && emotes.some(e => e.name === validated.name)) {
        return res.status(409).json({ error: 'An emote with that name already exists' });
    }

    const old = emotes[idx];
    emotes[idx] = validated;
    await saveChannelEmotes(req.bot.channel_id, emotes);

    const chan = getLoadedChannel(req.params.channel);
    if (chan && chan.modules.emotes) {
        if (validated.name !== emoteName) {
            chan.modules.emotes.emotes.renameEmote({ ...validated, old: emoteName });
            chan.broadcastAll('renameEmote', { ...validated, old: emoteName });
        } else {
            chan.modules.emotes.emotes.updateEmote(validated);
            chan.broadcastAll('updateEmote', validated);
        }
        chan.modules.emotes.dirty = true;
    }

    res.json(validated);
});

router.delete('/:name', botAuth, requireRank(4), async (req, res) => {
    const emoteName = req.params.name;
    const emotes = await getChannelEmotes(req.bot.channel_id);
    const idx = emotes.findIndex(e => e.name === emoteName);
    if (idx === -1) return res.status(404).json({ error: 'Emote not found' });

    emotes.splice(idx, 1);
    await saveChannelEmotes(req.bot.channel_id, emotes);

    const chan = getLoadedChannel(req.params.channel);
    if (chan && chan.modules.emotes) {
        chan.modules.emotes.emotes.removeEmote({ name: emoteName });
        chan.modules.emotes.dirty = true;
        chan.broadcastAll('removeEmote', { name: emoteName });
    }

    res.json({ success: true });
});

module.exports = router;
