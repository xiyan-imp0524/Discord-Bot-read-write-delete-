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
