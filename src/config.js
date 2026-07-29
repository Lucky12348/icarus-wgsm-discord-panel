require("dotenv").config();

module.exports = {
  TOKEN: process.env.DISCORD_TOKEN,

  PANEL_CHANNEL_ID: process.env.PANEL_CHANNEL_ID,
  BACKLOG_CHANNEL_ID: process.env.BACKLOG_CHANNEL_ID,
  SETTINGS_CHANNEL_ID: process.env.SETTINGS_CHANNEL_ID,

  SERVER_ID: process.env.SERVER_ID,
  PREFIX: process.env.CMD_PREFIX || "!wgsm",
  WGSM_BOT_ID: process.env.WGSM_BOT_ID,
  WAIT_MS: Number(process.env.WAIT_MS || 20000),

  BACKUPS_CHANNEL_ID: process.env.BACKUPS_CHANNEL_ID,
  BACKUPS_LOG_CHANNEL_ID: process.env.BACKUPS_LOG_CHANNEL_ID,
  PROSPECTS_DIR: process.env.PROSPECTS_DIR,

  DEFAULT_LANGUAGE: process.env.DEFAULT_LANGUAGE || "fr",
};
