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

## Requirements

- Node.js 18+ recommended
- A Discord application/bot from the Discord Developer Portal
- Bot invited to your server with permissions for messages (and voice if you use /play)

### Discord intents

Enable Message Content Intent in the Developer Portal when using auto-reply or notifications, and set `MESSAGE_CONTENT_INTENT=true` in .env.

## Quick start

```bash
git clone <your-repo-url>
cd <repo-folder>
npm install
cp .env.example .env
```

Edit .env with your token and IDs, then:

```bash
npm start
```

Auto-restart on crash:

```bash
npm run start:daemon
```

### Windows helpers

```powershell
.\setup.ps1
.\start-bot.ps1
```

## Environment variables

Copy from .env.example. Never commit .env.

| Variable | Required | Description |
|----------|----------|-------------|
| BOT_TOKEN | Yes | Bot token from Discord Developer Portal |
| GUILD_IDS | Yes | Comma-separated server IDs where the bot may run |
| ALLOWED_USERS | Yes | Comma-separated user IDs allowed to use commands |
| NOTIFY_USERS | No | Users in the notification group |
| AUTO_REPLY_USERS | No | Users who receive automatic replies when /auto is on |

| MESSAGE_CONTENT_INTENT | No | Set to 	rue if Message Content Intent is enabled |
| OPENAI_API_KEY | No | Enables smarter AI auto-replies |
| OPENAI_MODEL | No | Defaults to gpt-4o-mini |
| CONVERSATION_MEMORY_LIMIT | No | In-memory conversation size |
| CONVERSATION_API_LIMIT | No | Messages sent to the API |
| CONVERSATION_LOG_DIR | No | Log directory (default logs) |

### Finding Discord IDs

In Discord: **User Settings → Advanced → Developer Mode**, then right-click a server or user → **Copy Server ID** / **Copy User ID**.
