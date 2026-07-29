const { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require("discord.js");
const {
  PANEL_CHANNEL_ID,
  BACKLOG_CHANNEL_ID,
  BACKUPS_CHANNEL_ID,
  BACKUPS_LOG_CHANNEL_ID,
  SETTINGS_CHANNEL_ID,
  getWaitMs,
  getAutoUpdateRestartEnabled,
} = require("./config");
const { t, getLanguage, getSupportedLanguages } = require("./i18n");
const { styled, COLORS } = require("./ui");

// Presets offered in the settings panel for how long the bot waits for the
// WindowsGSM bot to answer before giving up (seconds).
const WAIT_MS_PRESETS = [30, 60, 120, 180, 300];

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

async function clearChannel(channel) {
  // Deletes everything (requires the "Manage Messages" permission)
  let fetched;
  do {
    fetched = await channel.messages.fetch({ limit: 100 });
    if (!fetched.size) break;

    for (const msg of fetched.values()) {
      await msg.delete().catch(() => {});
    }
  } while (fetched.size >= 2);
}

async function setupWgsmPanel(client) {
  const panelChannel = await client.channels.fetch(PANEL_CHANNEL_ID);
  await clearChannel(panelChannel);

  const wgsmRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("wgsm_start").setLabel(t("panelWgsm.buttonStart")).setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("wgsm_stop").setLabel(t("panelWgsm.buttonStop")).setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("wgsm_restart").setLabel(t("panelWgsm.buttonRestart")).setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("wgsm_update").setLabel(t("panelWgsm.buttonUpdate")).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("wgsm_info").setLabel(t("panelWgsm.buttonInfo")).setStyle(ButtonStyle.Secondary),
  );

  await panelChannel.send(
    styled(t("panelWgsm.intro", { channel: BACKLOG_CHANNEL_ID }), { color: COLORS.BRAND, actionRows: [wgsmRow] })
  );
}

async function setupBackupsPanel(client) {
  if (!BACKUPS_CHANNEL_ID) return;

  const backupsChannel = await client.channels.fetch(BACKUPS_CHANNEL_ID);
  await clearChannel(backupsChannel);

  const backupsRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("bk_open").setLabel(t("panelBackups.buttonManage")).setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("bk_refresh").setLabel(t("panelBackups.buttonRefresh")).setStyle(ButtonStyle.Secondary),
  );

  await backupsChannel.send(
    styled(t("panelBackups.intro", { channel: BACKUPS_LOG_CHANNEL_ID }), {
      color: COLORS.BRAND,
      actionRows: [backupsRow],
    })
  );
}

async function setupSettingsPanel(client) {
  if (!SETTINGS_CHANNEL_ID) return;

  const settingsChannel = await client.channels.fetch(SETTINGS_CHANNEL_ID);
  await clearChannel(settingsChannel);

  const langSelect = new StringSelectMenuBuilder()
    .setCustomId("settings_lang_select")
    .setPlaceholder(t("panelSettings.selectPlaceholder"))
    .addOptions(
      getSupportedLanguages().map((lang) => ({
        label: t(`panelSettings.language${capitalize(lang)}`),
        value: lang,
        default: lang === getLanguage(),
      }))
    );

  const currentWaitMs = getWaitMs();
  const timeoutSelect = new StringSelectMenuBuilder()
    .setCustomId("settings_timeout_select")
    .setPlaceholder(t("panelSettings.timeoutPlaceholder"))
    .addOptions(
      WAIT_MS_PRESETS.map((seconds) => ({
        label: `${seconds}s`,
        value: String(seconds * 1000),
        default: seconds * 1000 === currentWaitMs,
      }))
    );

  const autoUpdateEnabled = getAutoUpdateRestartEnabled();
  const autoUpdateSelect = new StringSelectMenuBuilder()
    .setCustomId("settings_autoupdate_select")
    .setPlaceholder(t("panelSettings.autoUpdatePlaceholder"))
    .addOptions([
      { label: t("panelSettings.autoUpdateOn"), value: "on", default: autoUpdateEnabled },
      { label: t("panelSettings.autoUpdateOff"), value: "off", default: !autoUpdateEnabled },
    ]);

  await settingsChannel.send(
    styled(t("panelSettings.intro"), {
      color: COLORS.BRAND,
      actionRows: [
        new ActionRowBuilder().addComponents(langSelect),
        new ActionRowBuilder().addComponents(timeoutSelect),
        new ActionRowBuilder().addComponents(autoUpdateSelect),
      ],
    })
  );
}

async function setupPanels(client) {
  await setupWgsmPanel(client);
  await setupBackupsPanel(client);
  await setupSettingsPanel(client);
}

module.exports = { setupPanels, clearChannel };
