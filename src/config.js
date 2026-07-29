require("dotenv").config();

// Overridable at runtime from the settings panel (persisted via
// settingsStore) - unlike the other values here, so it's a getter/setter
// pair instead of a plain constant.
let waitMs = Number(process.env.WAIT_MS || 120000);

function getWaitMs() {
  return waitMs;
}

function setWaitMs(ms) {
  waitMs = ms;
}

// Whether the bot auto-restarts the server when WGSM's own "Updated | Auto
// Update" alert shows up in the alerts channel - also overridable from the
// settings panel.
let autoUpdateRestartEnabled = true;

function getAutoUpdateRestartEnabled() {
  return autoUpdateRestartEnabled;
}

function setAutoUpdateRestartEnabled(enabled) {
  autoUpdateRestartEnabled = enabled;
}

module.exports = {
  TOKEN: process.env.DISCORD_TOKEN,

  PANEL_CHANNEL_ID: process.env.PANEL_CHANNEL_ID,
  BACKLOG_CHANNEL_ID: process.env.BACKLOG_CHANNEL_ID,
  SETTINGS_CHANNEL_ID: process.env.SETTINGS_CHANNEL_ID,
  ALERTS_CHANNEL_ID: process.env.ALERTS_CHANNEL_ID,

  SERVER_ID: process.env.SERVER_ID,
  PREFIX: process.env.CMD_PREFIX || "!wgsm",
  WGSM_BOT_ID: process.env.WGSM_BOT_ID,
  getWaitMs,
  setWaitMs,
  getAutoUpdateRestartEnabled,
  setAutoUpdateRestartEnabled,

  BACKUPS_CHANNEL_ID: process.env.BACKUPS_CHANNEL_ID,
  BACKUPS_LOG_CHANNEL_ID: process.env.BACKUPS_LOG_CHANNEL_ID,
  PROSPECTS_DIR: process.env.PROSPECTS_DIR,

  DEFAULT_LANGUAGE: process.env.DEFAULT_LANGUAGE || "fr",
};
