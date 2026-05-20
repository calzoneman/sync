#!/usr/bin/env node
/**
 * CyTube Sync — Demo Bot
 *
 * Shows the two halves of the bot API:
 *   • WebSocket (socket.io-client) — real-time events: chat, user list, playlist
 *   • REST API (fetch)             — queries and commands: playlist, emotes, settings, moderation
 *
 * Setup:
 *   cp .env.example .env   # fill in BOT_TOKEN and CHANNEL
 *   npm install
 *   node bot.js
 *
 * TUI keybindings:
 *   Enter       send message or run command
 *   PgUp/PgDn   scroll chat
 *   Ctrl-C      quit
 *
 * Commands (prefix with /):
 *   /help                  list commands
 *   /playlist              show current playlist via REST
 *   /emotes                list emotes via REST
 *   /settings              show channel settings via REST
 *   /users                 dump user list from in-memory state
 *   /add <type> <id>       add media   e.g. /add yt dQw4w9WgXcQ
 *   /skip                  skip to next playlist item
 *   /clear                 clear the playlist
 *   /kick <name> [reason]  kick a user
 *   /me <text>             send an action (/me) message
 */

'use strict';

require('dotenv').config();

const io     = require('socket.io-client');
const fetch  = require('node-fetch');
const blessed = require('blessed');

// ── Config ────────────────────────────────────────────────────────────────────

const {
    BOT_TOKEN,
    CHANNEL,
    SERVER_URL = 'http://localhost:8080',
    API_BASE   = 'http://localhost:8080/api/v1',
} = process.env;

if (!BOT_TOKEN || !CHANNEL) {
    console.error('BOT_TOKEN and CHANNEL must be set. Copy .env.example to .env and fill it in.');
    process.exit(1);
}

if (!BOT_TOKEN.startsWith('cbt_')) {
    console.error('BOT_TOKEN does not look right — it should start with cbt_');
    process.exit(1);
}

// ── REST helpers ──────────────────────────────────────────────────────────────

async function apiRequest(method, path, body) {
    const url = `${API_BASE}/channels/${CHANNEL}${path}`;
    const opts = {
        method,
        headers: {
            'Authorization': `Bearer ${BOT_TOKEN}`,
            'Content-Type': 'application/json',
        },
    };
    if (body !== undefined) opts.body = JSON.stringify(body);

    const res = await fetch(url, opts);
    const json = await res.json().catch(() => null);

    if (!res.ok) {
        throw new Error((json && json.error) || `HTTP ${res.status}`);
    }
    return json;
}

const api = {
    get:    (path)        => apiRequest('GET',    path),
    post:   (path, body)  => apiRequest('POST',   path, body),
    put:    (path, body)  => apiRequest('PUT',    path, body),
    delete: (path)        => apiRequest('DELETE', path),
};

// ── Utilities ─────────────────────────────────────────────────────────────────

function stripHtml(html) {
    return html
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
}

// Escape blessed tag syntax so server content can't inject markup.
function escBless(str) {
    return String(str).replace(/\{/g, '\\{');
}

function hhmm(secs) {
    return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
}

function timestamp() {
    return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ── In-memory state ───────────────────────────────────────────────────────────

const state = {
    users:      [],   // userlist entries from server
    nowPlaying: null, // current changeMedia payload
    connected:  false,
    inChannel:  false,
};

// ── TUI ───────────────────────────────────────────────────────────────────────

const screen = blessed.screen({
    smartCSR:    true,
    title:       `CyTube Bot :: #${CHANNEL}`,
    fullUnicode: true,
    forceUnicode: true,
});

// Top bar — connection status + now playing
const statusBar = blessed.box({
    top:     0,
    left:    0,
    width:   '100%',
    height:  1,
    tags:    true,
    style:   { bg: 'blue', fg: 'white', bold: true },
    content: ` CyTube Bot  #${CHANNEL}  Connecting...`,
});

// Main chat log (left, scrollable)
const chatLog = blessed.log({
    top:          1,
    left:         0,
    width:        '70%',
    height:       '100%-4',
    border:       { type: 'line' },
    label:        ' Chat ',
    scrollable:   true,
    alwaysScroll: true,
    scrollbar:    { ch: ' ', style: { bg: 'cyan' } },
    mouse:        true,
    tags:         true,
    wrap:         true,
    style:        { border: { fg: 'cyan' }, label: { fg: 'cyan', bold: true } },
});

// User list sidebar (right)
const userList = blessed.list({
    top:        1,
    right:      0,
    width:      '30%',
    height:     '100%-4',
    border:     { type: 'line' },
    label:      ' Users ',
    scrollable: true,
    mouse:      true,
    tags:       true,
    style: {
        border:   { fg: 'cyan' },
        label:    { fg: 'cyan', bold: true },
        item:     { fg: 'white' },
        selected: { fg: 'white' },
    },
});

// Input box (bottom)
const inputBox = blessed.textbox({
    bottom:         0,
    left:           0,
    width:          '100%',
    height:         3,
    border:         { type: 'line' },
    label:          ' Message — /help for commands — Ctrl-C to quit ',
    inputOnFocus:   true,
    style:          { border: { fg: 'green' }, label: { fg: 'green' } },
});

screen.append(statusBar);
screen.append(chatLog);
screen.append(userList);
screen.append(inputBox);

screen.key(['C-c'], () => process.exit(0));

// ── TUI helpers ───────────────────────────────────────────────────────────────

function setStatus(msg) {
    statusBar.setContent(` CyTube Bot  #${CHANNEL}  ${msg}`);
    screen.render();
}

function chat(line) {
    chatLog.log(line);
    screen.render();
}

function info(line) {
    chat(`{cyan-fg}${line}{/cyan-fg}`);
}

function warn(line) {
    chat(`{yellow-fg}${line}{/yellow-fg}`);
}

function fail(line) {
    chat(`{red-fg}✗ ${line}{/red-fg}`);
}

function rebuildUserList() {
    const items = state.users.map(u => {
        const isBot = u.meta && u.meta.is_bot;
        const afk   = u.meta && u.meta.afk;
        let rankStr;
        if      (u.rank >= 5) rankStr = '{red-fg}[creator]{/red-fg}';
        else if (u.rank >= 4) rankStr = '{yellow-fg}[owner]{/yellow-fg}';
        else if (u.rank >= 3) rankStr = '{magenta-fg}[admin]{/magenta-fg}';
        else if (u.rank >= 2) rankStr = '{green-fg}[mod]{/green-fg}';
        else                  rankStr = '';

        const botTag = isBot  ? ' {blue-fg}[bot]{/blue-fg}'  : '';
        const afkTag = afk    ? ' {grey-fg}[afk]{/grey-fg}'  : '';
        return `${escBless(u.name)} ${rankStr}${botTag}${afkTag}`;
    });

    userList.setLabel(` Users (${items.length}) `);
    userList.setItems(items);
    screen.render();
}

// ── Socket.IO ─────────────────────────────────────────────────────────────────

const socket = io(SERVER_URL, {
    // This is how the bot authenticates — token goes in socket.handshake.auth.token
    auth:               { token: BOT_TOKEN },
    reconnection:       true,
    reconnectionDelay:  3000,
    reconnectionAttempts: Infinity,
});

socket.on('connect', () => {
    state.connected = true;
    setStatus('Authenticating...');
});

socket.on('disconnect', (reason) => {
    state.connected = false;
    state.inChannel = false;
    state.users = [];
    rebuildUserList();
    warn(`Disconnected: ${reason}`);
    setStatus(`Disconnected — reconnecting...`);
});

socket.on('connect_error', (err) => {
    fail(`Connection error: ${err.message}`);
});

// Server confirms authentication and sends the bot's display name + rank.
// We wait for this before joining the channel to avoid any ordering issues.
socket.on('login', (data) => {
    if (data.success) {
        info(`Authenticated as: ${escBless(data.name)}`);
        socket.emit('joinChannel', { name: CHANNEL });
    } else {
        fail(`Authentication failed: ${escBless(data.error || 'unknown')}`);
    }
});

socket.on('errorMsg', (data) => {
    fail(escBless(data.msg || 'Server error'));
});

socket.on('kick', (data) => {
    fail(`Kicked: ${escBless(data.reason || '')}`);
    setStatus('Kicked from channel');
});

// ── Channel events ────────────────────────────────────────────────────────────

// Channel options (title, password, etc.)
socket.on('channelOpts', (opts) => {
    const title = opts.pagetitle || CHANNEL;
    const playing = state.nowPlaying ? ` — ${escBless(state.nowPlaying.title)}` : '';
    setStatus(`{bold}${escBless(title)}{/bold}${playing}`);
});

// ── User list events ──────────────────────────────────────────────────────────

// Full user list, sent on join and refresh
socket.on('userlist', (users) => {
    state.users = users;
    state.inChannel = true;
    rebuildUserList();
    info(`Joined #${CHANNEL} — ${users.length} user(s) present`);
});

// New user joined
socket.on('addUser', (user) => {
    state.users = state.users.filter(u => u.name !== user.name);
    state.users.push(user);
    rebuildUserList();
    chat(`{green-fg}→ ${escBless(user.name)} joined{/green-fg}`);
});

// User left
socket.on('userLeave', (data) => {
    state.users = state.users.filter(u => u.name !== data.name);
    rebuildUserList();
    chat(`{red-fg}← ${escBless(data.name)} left{/red-fg}`);
});

// Rank changed for a user
socket.on('setUserRank', (data) => {
    const user = state.users.find(u => u.name === data.name);
    if (user) user.rank = data.rank;
    rebuildUserList();
});

// AFK / mute state changed
socket.on('setUserMeta', (data) => {
    const user = state.users.find(u => u.name === data.name);
    if (user) Object.assign(user.meta, data.meta);
    rebuildUserList();
});

// ── Chat events ───────────────────────────────────────────────────────────────

socket.on('chatMsg', (data) => {
    const time     = timestamp();
    const name     = escBless(data.username || '?');
    const msg      = escBless(stripHtml(data.msg || ''));
    const isAction = data.meta && data.meta.addClass === 'action';

    // is_bot is set by the server in the message meta; fall back to checking
    // the local user list in case the message arrives before the userlist does.
    const senderInList = state.users.find(u => u.name === data.username);
    const isBot = (data.meta && data.meta.is_bot) ||
                  (senderInList && senderInList.meta && senderInList.meta.is_bot);
    const botTag = isBot ? ' {blue-fg}[bot]{/blue-fg}' : '';

    if (isAction) {
        chat(`{grey-fg}[${time}]{/grey-fg}${botTag} {italic}* ${name} ${msg}{/italic}`);
    } else {
        chat(`{grey-fg}[${time}]{/grey-fg} {bold}${name}{/bold}${botTag}: ${msg}`);
    }
});

// Private messages
socket.on('pm', (data) => {
    const name = escBless(data.username || '?');
    const msg  = escBless(stripHtml(data.msg || ''));
    chat(`{magenta-fg}[PM ← ${name}]{/magenta-fg} ${msg}`);
});

// Chat cleared by a moderator
socket.on('clearchat', () => {
    chatLog.setContent('');
    info('Chat was cleared by a moderator.');
    screen.render();
});

// ── Playlist events ───────────────────────────────────────────────────────────

// Full playlist on join
socket.on('playlist', (items) => {
    if (items.length > 0) {
        info(`Playlist loaded: ${items.length} item(s)`);
    }
});

// New item added to playlist by someone
socket.on('queue', (data) => {
    const item = data.item;
    if (item && item.media) {
        info(`Queued: [${item.media.type}] ${escBless(item.media.title)}`);
    }
});

// Currently playing changed
socket.on('changeMedia', (media) => {
    state.nowPlaying = media;
    const dur = media.seconds ? ` (${hhmm(media.seconds)})` : '';
    const title = escBless(media.title || media.id);
    setStatus(`▶ ${title}${dur}`);
    info(`Now playing: {bold}${title}{/bold}${dur}`);
});

// ── Emote events ──────────────────────────────────────────────────────────────

socket.on('updateEmote', (emote) => {
    info(`Emote updated: :${escBless(emote.name)}:`);
});

socket.on('removeEmote', (data) => {
    info(`Emote removed: :${escBless(data.name)}:`);
});

// ── Commands ──────────────────────────────────────────────────────────────────

const COMMANDS = {
    help() {
        info('─── Commands ───────────────────────────────────────────────────');
        info('  /playlist              fetch and show the playlist');
        info('  /emotes                list emote names');
        info('  /settings              show channel settings');
        info('  /users                 dump in-memory user list');
        info('  /add <type> <id>       add media  e.g. /add yt dQw4w9WgXcQ');
        info('  /skip                  skip to next playlist item');
        info('  /clear                 clear the playlist');
        info('  /kick <name> [reason]  kick a user from the channel');
        info('  /me <text>             send an action message');
        info('  <anything else>        send as a chat message');
        info('───────────────────────────────────────────────────────────────');
    },

    async playlist() {
        try {
            const data = await api.get('/playlist');
            info(`─── Playlist (${data.items.length} item${data.items.length !== 1 ? 's' : ''}) ──`);
            if (data.items.length === 0) {
                info('  (empty)');
            } else {
                data.items.forEach((item, i) => {
                    const dur    = item.seconds ? hhmm(item.seconds) : '?:??';
                    const marker = i === data.currentIndex ? '{yellow-fg}▶{/yellow-fg}' : ' ';
                    info(`  ${marker} [${item.type}] ${escBless(item.title)} (${dur}) uid:${item.uid}`);
                });
            }
            if (data.locked) warn('  Playlist is locked');
        } catch (e) {
            fail(`playlist: ${e.message}`);
        }
    },

    async emotes() {
        try {
            const emotes = await api.get('/emotes');
            info(`─── Emotes (${emotes.length}) ──`);
            if (emotes.length === 0) {
                info('  (none)');
            } else {
                // Print names in rows of 8
                for (let i = 0; i < emotes.length; i += 8) {
                    info('  ' + emotes.slice(i, i + 8).map(e => `:${escBless(e.name)}:`).join('  '));
                }
            }
        } catch (e) {
            fail(`emotes: ${e.message}`);
        }
    },

    async settings() {
        try {
            const s = await api.get('/settings');
            info('─── Channel Settings ──');
            for (const [k, v] of Object.entries(s)) {
                if (v !== null && v !== '' && v !== false) {
                    info(`  ${k}: ${escBless(String(v))}`);
                }
            }
        } catch (e) {
            fail(`settings: ${e.message}`);
        }
    },

    users() {
        info(`─── Users (${state.users.length}) ──`);
        state.users.forEach(u => {
            const rank  = u.rank >= 5 ? 'creator' : u.rank >= 4 ? 'owner' : u.rank >= 3 ? 'admin' : u.rank >= 2 ? 'mod' : 'user';
            const isBot = u.meta && u.meta.is_bot ? ' [bot]' : '';
            info(`  ${escBless(u.name)} (${rank} rank:${u.rank})${isBot}`);
        });
    },

    async add(args) {
        const parts = args.trim().split(/\s+/);
        if (parts.length < 2) {
            fail('Usage: /add <type> <id>   e.g. /add yt dQw4w9WgXcQ');
            return;
        }
        const [type, id] = parts;
        try {
            await api.post('/playlist', { type, id, pos: 'end' });
            info(`Added [${type}] ${escBless(id)} to playlist`);
        } catch (e) {
            fail(`add: ${e.message}`);
        }
    },

    async skip() {
        try {
            const data = await api.get('/playlist');
            if (data.items.length === 0) { warn('Playlist is empty'); return; }
            const idx = data.currentIndex;
            if (idx < 0 || idx >= data.items.length - 1) {
                warn('No next item in playlist');
                return;
            }
            const next = data.items[idx + 1];
            await api.put('/playlist/playing', { uid: next.uid });
            info(`Skipped to: ${escBless(next.title)}`);
        } catch (e) {
            fail(`skip: ${e.message}`);
        }
    },

    async clear() {
        try {
            await api.post('/playlist/clear');
            info('Playlist cleared');
        } catch (e) {
            fail(`clear: ${e.message}`);
        }
    },

    async kick(args) {
        const parts  = args.trim().split(/\s+/);
        const name   = parts[0];
        const reason = parts.slice(1).join(' ') || 'Kicked by bot';
        if (!name) { fail('Usage: /kick <name> [reason]'); return; }
        try {
            await api.post(`/users/${encodeURIComponent(name)}/kick`, { reason });
            info(`Kicked ${escBless(name)}`);
        } catch (e) {
            fail(`kick: ${e.message}`);
        }
    },

    me(args) {
        const text = args.trim();
        if (!text) { fail('Usage: /me <text>'); return; }
        socket.emit('chatMsg', { msg: `/me ${text}` });
    },
};

async function handleInput(line) {
    line = line.trim();
    if (!line) return;

    if (line.startsWith('/')) {
        const space = line.indexOf(' ');
        const name  = (space === -1 ? line.slice(1) : line.slice(1, space)).toLowerCase();
        const args  = space === -1 ? '' : line.slice(space + 1);

        if (COMMANDS[name]) {
            try {
                await COMMANDS[name](args);
            } catch (e) {
                fail(`Command error: ${e.message}`);
            }
        } else {
            fail(`Unknown command: /${name}  (type /help for a list)`);
        }
    } else {
        // Regular chat message — sent over the WebSocket, not REST.
        // The server will echo it back as a chatMsg event.
        socket.emit('chatMsg', { msg: line });
    }
}

// ── Input box wiring ──────────────────────────────────────────────────────────

inputBox.on('submit', async (value) => {
    inputBox.clearValue();
    inputBox.focus();
    screen.render();
    if (value && value.trim()) {
        await handleInput(value);
    }
});

// Pressing Enter submits, but blessed's textbox needs this nudge
inputBox.key('enter', () => inputBox.submit());

// ── Boot ──────────────────────────────────────────────────────────────────────

info(`Connecting to ${SERVER_URL} as bot in #${CHANNEL}...`);
info('Type /help for available commands.');

inputBox.focus();
screen.render();
