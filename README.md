# icarus-wgsm-discord-panel

Discord bot that serves as a homemade control panel for a server between
friends running Icarus, managed via [WindowsGSM](https://github.com/WindowsGSM/WindowsGSM).

## Functionalities

- **Server panel**: Start / Stop / Restart / Update / Info buttons that
  send the corresponding command to the WindowsGSM bot in a "backlog"
  channel, then return its response to the user.
- **Backups panel**: lists saved maps, lets you choose a backup to
  restore (with confirmation), logs the operation in a log channel, and
  automatically restarts the server after restoration.
- Access restricted to members with the Discord `Administrator` permission.

## Install

```bash
npm install
cp .env.example .env
```

## Starting

```bash
npm start
```

##  `.env` :

| Variable | Description |
|---|---|
| `DISCORD_TOKEN` | Discord bot token |
| `PANEL_CHANNEL_ID` | Channel where the server control panel is displayed |
| `BACKLOG_CHANNEL_ID` | Channel where commands are sent to the WindowsGSM bot |
| `SERVER_ID` | ID of the server managed by WindowsGSM |
| `CMD_PREFIX` | Command prefix for the WindowsGSM bot (default `!wgsm`) |
| `WGSM_BOT_ID` | ID of the WindowsGSM bot (to identify its responses) |
| `WAIT_MS` | Delay to wait for a response before timing out (ms) |
| `BACKUPS_CHANNEL_ID` | Channel for the backups management panel (optional) |
| `BACKUPS_LOG_CHANNEL_ID` | Log channel for restorations |
| `PROSPECTS_DIR` | Local path to the Icarus saves folder |

