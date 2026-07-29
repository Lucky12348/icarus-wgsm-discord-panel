# icarus-wgsm-discord-panel

Discord bot that serves as a homemade control panel for a server between
friends running Icarus, managed via [WindowsGSM](https://github.com/WindowsGSM/WindowsGSM).

## Functionalities

- **Server panel**: Start / Stop / Restart / Update / Info buttons that
  send the corresponding command to the WindowsGSM bot in a "backlog"
  channel, then return its response to the user.
- **Backups panel**: lists saved maps, lets you choose a backup to
  restore (with confirmation), stops the server, restores the backup,
  logs the operation in a log channel, and restarts the server.
- Access is controlled by Discord channel permissions: whoever can see
  and use the panel channel can use it. No extra role/permission check
  is enforced in code — manage access by granting/revoking channel
  access to the relevant roles.

## Install

```bash
npm install
cp .env.example .env
```

## Starting

```bash
npm start
```

## Deployment (auto-restart on the Windows Server)

To keep the bot running without needing to log into the server (survives
crashes and reboots), register it as a scheduled task, as Administrator,
once on the server, from the project root:

```powershell
npm run setup:autostart
```

This registers a scheduled task that runs the bot via `run-bot.bat` (logs
to `bot.log`), starts it at Windows boot without requiring a logged-in
user, and restarts it automatically if it crashes — then immediately
starts the bot, without waiting for a reboot.

## `.env`

| Variable | Description |
|---|---|
| `DISCORD_TOKEN` | Discord bot token |
| `PANEL_CHANNEL_ID` | Channel where the server control panel is displayed |
| `BACKLOG_CHANNEL_ID` | Channel where commands are sent to the WindowsGSM bot |
| `SETTINGS_CHANNEL_ID` | Channel for the settings panel (language, wait time - optional) |
| `SERVER_ID` | ID of the server managed by WindowsGSM |
| `CMD_PREFIX` | Command prefix for the WindowsGSM bot (default `!wgsm`) |
| `WGSM_BOT_ID` | ID of the WindowsGSM bot (to identify its responses) |
| `WAIT_MS` | Initial delay to wait for a response before timing out (ms), overridden at runtime via the settings panel |
| `BACKUPS_CHANNEL_ID` | Channel for the backups management panel (optional) |
| `BACKUPS_LOG_CHANNEL_ID` | Log channel for restorations |
| `PROSPECTS_DIR` | Local path to the Icarus saves folder |
| `DEFAULT_LANGUAGE` | Default UI language (`fr` or `en`), overridden at runtime via the settings panel |

## Project structure

```
index.js                        entrypoint: client setup, event wiring, login
src/
  config.js                     env vars
  format.js                     date/size formatting, delay()
  settingsStore.js              persists runtime settings (data/settings.json)
  wgsmBridge.js                 sends commands to the WindowsGSM bot, matches replies
  backups.js                    save/backup listing and restore logic
  panels.js                     builds and (re)posts the Discord panels
  i18n/
    index.js                    t() / setLanguage() / getLanguage()
    locales/en.json, fr.json    message catalogs
  interactions/
    buttons.js                  button interaction handlers
    selectMenus.js               select menu interaction handlers (incl. language switch)
```

## Language / i18n

All user-facing Discord messages are translated via `src/i18n`. To add a
language: drop a new `src/i18n/locales/<code>.json` with the same keys as
`en.json`, register it in `CATALOGS` in `src/i18n/index.js`, and add
`panelSettings.language<Code>` entries to every catalog (including the new
one) so it shows up as an option in the settings panel.

The active language can be changed at runtime from the settings panel
(`SETTINGS_CHANNEL_ID`) — it's persisted to `data/settings.json` and
survives restarts.

