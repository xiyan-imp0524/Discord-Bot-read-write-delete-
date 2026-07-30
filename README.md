# discord-clear-bot

A Discord.js bot for allowed servers and users: clear recent messages, play local audio in voice channels, send private notifications, and optionally auto-reply (built-in or OpenAI).

## Features

| Command | Description |
|---------|-------------|
| `/cute` | Delete the last 100 messages in the current channel |
| `/play` | Play an audio file from the `songs/` folder (join a voice channel first) |
| `/stop` | Stop playback and leave the voice channel |
| `/tell` | Notify another user in the notification group |
| `/auto` | Enable or disable auto-reply for users listed in `AUTO_REPLY_USERS` |

Also supports targeted desktop/OS notifications between `NOTIFY_USERS`, and optional conversation logging when auto-reply is enabled with `logging: true`.

## Requirements

- [Node.js](https://nodejs.org/) 18+ recommended
- A Discord application/bot from the [Discord Developer Portal](https://discord.com/developers/applications)
- Bot invited to your server with permissions for messages (and voice if you use `/play`)

### Discord intents

Enable these Privileged Gateway Intents in the Developer Portal if you use the related features:

- **Message Content Intent** — set `MESSAGE_CONTENT_INTENT=true` in `.env` when you need message content for auto-reply / notifications

## Quick start

```bash
git clone <your-repo-url>
cd <repo-folder>
npm install
cp .env.example .env   # on Windows: copy .env.example .env
```

Edit `.env` with your token and IDs, then:

```bash
npm start
```

Auto-restart on crash:

```bash
npm run start:daemon
```

### Windows helpers

```powershell
.\setup.ps1      # interactive .env creation
.\start-bot.ps1  # starts with auto-restart
```

## Environment variables

Copy from `.env.example`. Never commit `.env`.

| Variable | Required | Description |
|----------|----------|-------------|
| `BOT_TOKEN` | Yes | Bot token from Discord Developer Portal |
| `GUILD_IDS` | Yes | Comma-separated server IDs where the bot may run |
| `ALLOWED_USERS` | Yes | Comma-separated user IDs allowed to use commands |
| `NOTIFY_USERS` | No | Users in the notification group (`/tell` and targeted alerts) |
| `AUTO_REPLY_USERS` | No | Users who receive automatic replies when `/auto` is on |
| `MESSAGE_CONTENT_INTENT` | No | Set to `true` if Message Content Intent is enabled |
| `OPENAI_API_KEY` | No | Enables smarter AI auto-replies |
| `OPENAI_MODEL` | No | Defaults to `gpt-4o-mini` |
| `CONVERSATION_MEMORY_LIMIT` | No | In-memory conversation size |
| `CONVERSATION_API_LIMIT` | No | Messages sent to the API |
| `CONVERSATION_LOG_DIR` | No | Log directory (default `logs`) |

### Finding Discord IDs

In Discord: **User Settings → Advanced → Developer Mode**, then right-click a server or user → **Copy Server ID** / **Copy User ID**.

## Project layout

```
index.js           # Bot entry, slash commands
reply.js           # Auto-reply helpers
notify.js          # User notifications
conversationLog.js # Optional session logs
autoReplyState.js  # Persists /auto on/off
run-forever.js     # Restart wrapper
songs/             # Audio files for /play
.env.example       # Env template
```

## Permissions

For `/cute`, the bot needs in the channel:

- View Channel  
- Read Message History  
- Manage Messages  

For `/play`, the bot needs Connect and Speak in the voice channel.

## Deploy / host notes

This is a long-running Node process (not a static site). Typical options:

1. **VPS / local machine** — `npm install` + `npm run start:daemon`
2. **Process manager** — [PM2](https://pm2.keymetrics.io/): `pm2 start index.js --name discord-clear-bot`
3. **GitHub** — push source (`.env` is gitignored); set secrets on your host, not in the repo

Keep `BOT_TOKEN` and `OPENAI_API_KEY` out of git. Use `.env.example` as the public template.

## License

Private / use as you like unless you add a license file.
