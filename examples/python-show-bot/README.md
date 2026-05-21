# Python Show Bot Example

Uses `veretube-bot==0.1.4` with `AsyncBot` and the built-in Shows API helpers.

## Setup

```bash
cd examples/python-show-bot
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Set environment variables:

- `BOT_TOKEN` (required)
- `CHANNEL` (required)
- `SOCKET_URL` (default: `http://localhost:1337`)
- `API_BASE` (default: `http://localhost:8080/api/v1`)
- `SHOW_TIMEZONE` (default: `UTC`, must be valid IANA timezone)

Run:

```bash
python bot.py
```

## Chat Commands

- `!shows` - list shows
- `!mkshow` - create a demo show
- `!runshow <id>` - run a show immediately
