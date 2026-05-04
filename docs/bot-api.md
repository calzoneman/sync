# Bot API

Bots connect to a channel in two ways:

- **WebSocket** (socket.io) — real-time events: chat, user list, playlist changes, media updates
- **REST** (`/api/v1/...`) — commands: queue/delete/shuffle/clear playlist, manage emotes, read/write settings, kick/ban users

Chat can only be sent and received over the WebSocket. The REST API has no chat endpoint.

---

## Ranks

| Name      | Value |
|-----------|-------|
| Moderator | 2     |
| Admin     | 3     |
| Owner     | 4     |
| Creator   | 5     |

A bot's rank is capped at the rank of the user who issued its token. Every REST endpoint that modifies state has a minimum rank requirement listed in its description.

---

## Issuing a token

Tokens are issued in the channel settings modal on the **Bots** tab. You need at least moderator rank (2) to see this tab.

Fill in a name (1–20 alphanumeric, `-`, `_` characters), choose a rank, and click **Issue Token**. The token is shown **once** — copy it immediately. It looks like:

```
cbt_a3f8e2...64 hex characters...
```

To revoke a token, click **Revoke** next to it in the table. Any live WebSocket connections using that token are disconnected immediately.

---

## WebSocket connection

The bot authenticates by passing the token in the socket.io `auth` object:

```js
const io = require('socket.io-client');

const socket = io('http://your-server:1337', {
    auth: { token: process.env.BOT_TOKEN }
});
```

> **Port note:** socket.io runs on the port defined by `io.port` in your server config (default 1337), which is separate from the HTTP port used for the web UI and REST API.

### Join sequence

After connecting you must wait for the `login` event before emitting `joinChannel`, otherwise the server will ignore it:

```js
socket.once('login', () => {
    socket.emit('joinChannel', { name: 'your-channel-name' });
});
```

### Sending chat

```js
socket.emit('chatMsg', { msg: 'Hello from a bot!' });
// Action message:
socket.emit('chatMsg', { msg: '/me waves' });
```

### Events the bot receives

| Event            | Payload                                      | Description                         |
|------------------|----------------------------------------------|-------------------------------------|
| `login`          | `{ success, name, guest }`                   | Server accepted the connection      |
| `chatMsg`        | `{ username, msg, meta, time }`              | A chat message was sent             |
| `userlist`       | `[{ name, rank, meta }, ...]`                | Full user list on join              |
| `addUser`        | `{ name, rank, meta }`                       | A user joined the channel           |
| `userLeave`      | `{ name }`                                   | A user left the channel             |
| `setUserMeta`    | `{ name, meta }`                             | A user's meta (AFK, muted) changed  |
| `changeMedia`    | `{ id, type, title, seconds, ... }`          | A new video started playing         |
| `playlist`       | `[{ uid, media, queueby, temp }, ...]`       | Full playlist on join               |
| `queue`          | `{ item, after }`                            | An item was added to the playlist   |
| `delete`         | `{ uid }`                                    | A playlist item was removed         |
| `errorMsg`       | `{ msg }`                                    | An error from the server            |
| `kick`           | `{ reason }`                                 | The bot was kicked                  |
| `announcement`   | `{ title, text }`                            | Server-wide announcement            |

`meta.is_bot` is set to `true` in `chatMsg` and user list payloads for bots, which the web UI renders as a `[bot]` badge.

---

## REST API

### Base URL

```
http://your-server:8080/api/v1
```

All channel-scoped endpoints are under `/channels/:channel/`.

### Authentication

Every REST request must include the bot token as a Bearer token:

```
Authorization: Bearer cbt_...
```

The token is validated against the channel in the URL — a token issued for `#general` will be rejected for `/channels/gaming/...`.

### Error responses

All errors return JSON:

```json
{ "error": "Human readable message" }
```

Common status codes:

| Code | Meaning                                               |
|------|-------------------------------------------------------|
| 400  | Bad request (missing/invalid fields)                  |
| 401  | Missing or invalid token                              |
| 403  | Token not authorized for this channel, or rank too low |
| 404  | Resource not found                                    |
| 503  | Channel is not currently active (no users in it)      |

---

### Playlist

Playlist endpoints require the channel to be active (at least one user present).

#### `GET /channels/:channel/playlist`

Returns the current playlist and which item is playing.

No minimum rank.

**Response:**

```json
{
  "items": [
    {
      "uid": 1,
      "id": "dQw4w9WgXcQ",
      "type": "yt",
      "title": "Rick Astley - Never Gonna Give You Up",
      "seconds": 212,
      "duration": "3:32",
      "thumb": { "url": "..." },
      "meta": {}
    }
  ],
  "currentIndex": 0,
  "locked": false
}
```

`uid` is the server-assigned unique ID for the playlist slot. Use it for delete/jump operations.

#### `POST /channels/:channel/playlist`

Queue a new item. Minimum rank: **2 (Mod)**.

Returns `202 Accepted` immediately because media lookup is asynchronous. If the bot's permissions don't allow the add (e.g. playlist is locked and rank is too low), a `400` is returned synchronously.

**Body:**

```json
{ "id": "dQw4w9WgXcQ", "type": "yt", "pos": "end" }
```

| Field | Required | Values              | Default |
|-------|----------|---------------------|---------|
| `id`  | yes      | media ID string     |         |
| `type`| yes      | see media types below |       |
| `pos` | no       | `"end"` or `"next"` | `"end"` |

**Media types:**

| Type | Source               |
|------|----------------------|
| `yt` | YouTube              |
| `sc` | SoundCloud           |
| `tw` | Twitch stream        |
| `tc` | Twitch clip          |
| `rt` | Dailymotion          |
| `vm` | Vimeo                |
| `dm` | Dailymotion          |
| `gd` | Google Drive         |
| `fi` | Direct file URL      |
| `cu` | Custom embed (HTML)  |

#### `DELETE /channels/:channel/playlist/:uid`

Remove a playlist item by uid. Minimum rank: **3 (Admin)**.

#### `PUT /channels/:channel/playlist/playing`

Skip to a specific item. Minimum rank: **2 (Mod)**.

**Body:**

```json
{ "uid": 3 }
```

#### `POST /channels/:channel/playlist/shuffle`

Shuffle the playlist. Minimum rank: **3 (Admin)**.

#### `POST /channels/:channel/playlist/clear`

Clear the entire playlist. Minimum rank: **3 (Admin)**.

---

### Emotes

Emote endpoints read and write directly to the database and work even when the channel is offline. If the channel happens to be active, changes are broadcast live to connected users.

#### `GET /channels/:channel/emotes`

Returns the full emote list. No minimum rank.

**Response:**

```json
[
  { "name": "KEKW", "image": "https://cdn.example.com/kekw.png", "source": "..." }
]
```

#### `POST /channels/:channel/emotes`

Add a new emote. Minimum rank: **4 (Owner)**.

**Body:**

```json
{ "name": "KEKW", "image": "https://cdn.example.com/kekw.png" }
```

Returns `409 Conflict` if the name is already taken.

#### `PUT /channels/:channel/emotes/:name`

Update an emote's image or rename it. Minimum rank: **4 (Owner)**.

**Body** (all fields optional, but at least one must differ):

```json
{ "image": "https://cdn.example.com/kekw-v2.png", "newName": "KEKWait" }
```

Omit `newName` to keep the existing name. Returns `409` if the new name is already taken.

#### `DELETE /channels/:channel/emotes/:name`

Delete an emote by name. Minimum rank: **4 (Owner)**.

---

### Users / Moderation

These endpoints require the channel to be active.

#### `GET /channels/:channel/users`

List currently connected users. No minimum rank.

**Response:**

```json
[
  { "name": "Alice", "rank": 3, "afk": false, "is_bot": false },
  { "name": "MyBot",  "rank": 2, "afk": false, "is_bot": true  }
]
```

#### `POST /channels/:channel/users/:name/kick`

Kick a user. Minimum rank: **2 (Mod)**. Cannot kick users with equal or higher rank.

**Body:**

```json
{ "reason": "Spamming" }
```

`reason` is optional, defaults to `"Kicked by bot"`.

#### `POST /channels/:channel/users/:name/ban`

Ban a user by name. Minimum rank: **3 (Admin)**. Cannot ban users with equal or higher rank.

**Body:**

```json
{ "reason": "Ban evasion" }
```

`reason` is optional, defaults to `"Banned by bot"`.

#### `DELETE /channels/:channel/users/:name/ban`

Remove a ban. Minimum rank: **3 (Admin)**.

#### `PUT /channels/:channel/users/:name/rank`

Change a user's channel rank. Minimum rank: **4 (Owner)**. Cannot assign a rank equal to or higher than your own, and cannot target users with equal or higher rank.

**Body:**

```json
{ "rank": 2 }
```

---

### Settings

Settings endpoints require the channel to be active. Minimum rank: **4 (Owner)** for both read and write.

#### `GET /channels/:channel/settings`

Returns current channel options.

**Response:**

```json
{
  "pagetitle": "My Channel",
  "allow_voteskip": true,
  "voteskip_ratio": 0.5,
  "maxlength": 0,
  "afk_timeout": 600,
  "password": "",
  "show_public": false,
  ...
}
```

**Available keys:**

`allow_voteskip`, `allow_dupes`, `voteskip_ratio`, `maxlength`, `playlist_max_duration_per_user`, `afk_timeout`, `enable_link_regex`, `chat_antiflood`, `chat_antiflood_burst`, `chat_antiflood_sustained`, `new_user_chat_delay`, `new_user_chat_link_delay`, `pagetitle`, `password`, `externalcss`, `externaljs`, `show_public`, `torbanned`, `block_anonymous_users`, `allow_ascii_control`, `playlist_max_per_user`

#### `PUT /channels/:channel/settings`

Update one or more settings. Unknown keys are silently ignored.

**Body:**

```json
{ "pagetitle": "Now Playing: Chill Beats", "allow_voteskip": false }
```

---

### Bot management

These endpoints use **session cookie auth** (the normal logged-in web session), not a bot token. They are intended for the channel settings UI.

#### `GET /channels/:channel/bots`

List all bots for the channel. Returns id, name, rank, creator, creation time, last connection time. Requires channel rank ≥ 2.

#### `POST /channels/:channel/bots`

Issue a new bot token. Requires channel rank ≥ 2. The returned `token` is shown **once** and not stored.

**Body:**

```json
{ "name": "MyBot", "rank": 2 }
```

**Response:**

```json
{ "id": 7, "name": "MyBot", "rank": 2, "token": "cbt_..." }
```

#### `DELETE /channels/:channel/bots/:id`

Revoke a bot token. Any live socket connections for that bot are disconnected immediately. Requires channel rank ≥ 2 and your rank must be ≥ the bot's rank.

---

## Demo bot

A working example with a TUI is in `examples/demo-bot/`.

```
cd examples/demo-bot
npm install
cp .env.example .env
# Edit .env: fill in BOT_TOKEN, CHANNEL, SERVER_URL, API_BASE
node bot.js
```

**.env fields:**

| Variable     | Description                                             | Default                           |
|--------------|---------------------------------------------------------|-----------------------------------|
| `BOT_TOKEN`  | Bot token from the channel settings Bots tab            | —                                 |
| `CHANNEL`    | Channel name (lowercase, no `#`)                        | —                                 |
| `SERVER_URL` | socket.io URL (use the io.port, not the HTTP port)      | `http://localhost:1337`           |
| `API_BASE`   | Base URL for REST requests                              | `http://localhost:8080/api/v1`    |

**TUI keybindings:** Enter to send, PgUp/PgDn to scroll, Ctrl-C to quit.

**Bot commands** (prefix with `/` in the input box):

| Command                  | Description                            |
|--------------------------|----------------------------------------|
| `/help`                  | List commands                          |
| `/playlist`              | Show playlist via REST                 |
| `/emotes`                | List emotes via REST                   |
| `/settings`              | Show channel settings via REST         |
| `/users`                 | Show connected user list               |
| `/add <type> <id>`       | Queue media, e.g. `/add yt dQw4w9WgXcQ` |
| `/skip`                  | Skip to next item                      |
| `/clear`                 | Clear the playlist                     |
| `/kick <name> [reason]`  | Kick a user                            |
| `/me <text>`             | Send an action message                 |
