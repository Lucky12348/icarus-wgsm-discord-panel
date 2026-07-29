const { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require("discord.js");
const fs = require("fs/promises");
const path = require("path");
const { t, setLanguage, getSupportedLanguages } = require("../i18n");
const { PROSPECTS_DIR } = require("../config");
const { listBackupsForMap } = require("../backups");
const { fmtDate, fmtSize } = require("../format");
const { saveSettings } = require("../settingsStore");
const { setupPanels } = require("../panels");

// Backups session per user (to keep context between menus)
const backupSessions = new Map(); // userId -> { mapName }

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

async function handleSelectMenuInteraction(client, interaction) {
  const { customId } = interaction;

  if (customId.startsWith("bk_map_select:")) {
    return handleMapSelect(interaction);
  }
  if (customId.startsWith("bk_backup_select:")) {
    return handleBackupSelect(interaction);
  }
  if (customId === "settings_lang_select") {
    return handleLanguageSelect(client, interaction);
  }
}

async function handleMapSelect(interaction) {
  const userId = interaction.customId.split(":")[1];
  if (interaction.user.id !== userId) {
    return interaction.reply({ content: t("common.notYourAction"), ephemeral: true });
  }

  const mapName = interaction.values[0];
  backupSessions.set(interaction.user.id, { mapName });

  await interaction.deferReply({ ephemeral: true });

  let backups;
  try {
    backups = await listBackupsForMap(mapName);
  } catch (e) {
    return interaction.editReply(t("errors.listBackupsFailed", { error: String(e.message || e) }));
  }

  const onlyBackups = backups.filter((b) => b.kind === "backup");
  if (!onlyBackups.length) {
    return interaction.editReply(t("errors.noBackupsForMap", { map: mapName }));
  }

  const options = onlyBackups.slice(0, 25).map((b) => ({
    label: b.fileName,
    value: b.fileName,
    description: `${fmtDate(b.mtime)} • ${fmtSize(b.size)}`,
  }));

  const select = new StringSelectMenuBuilder()
    .setCustomId(`bk_backup_select:${interaction.user.id}:${encodeURIComponent(mapName)}`)
    .setPlaceholder(t("backupFlow.selectBackupPlaceholder"))
    .addOptions(options);

  return interaction.editReply({
    content: t("backupFlow.selectBackupPrompt", { map: mapName }),
    components: [new ActionRowBuilder().addComponents(select)],
  });
}

async function handleBackupSelect(interaction) {
  const parts = interaction.customId.split(":");
  const userId = parts[1];
  const mapName = decodeURIComponent(parts.slice(2).join(":") || "");

  if (interaction.user.id !== userId) {
    return interaction.reply({ content: t("common.notYourAction"), ephemeral: true });
  }

  const backupFile = interaction.values[0];

  await interaction.deferReply({ ephemeral: true });

  const confirmRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`bk_confirm:${interaction.user.id}:${encodeURIComponent(mapName)}:${encodeURIComponent(backupFile)}`)
      .setLabel(t("backupFlow.confirmButtonConfirm"))
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`bk_cancel:${interaction.user.id}`)
      .setLabel(t("backupFlow.confirmButtonCancel"))
      .setStyle(ButtonStyle.Secondary)
  );

  // Info line (mtime/size) for the user's clarity
  let infoLine = "";
  try {
    const st = await fs.stat(path.join(PROSPECTS_DIR, backupFile));
    infoLine = t("backupFlow.confirmInfoLine", { date: fmtDate(st.mtime), size: fmtSize(st.size) });
  } catch {
    // ignore
  }

  return interaction.editReply({
    content: t("backupFlow.confirmPrompt", { map: mapName, backup: backupFile, infoLine }),
    components: [confirmRow],
  });
}

async function handleLanguageSelect(client, interaction) {
  const lang = interaction.values[0];
  if (!getSupportedLanguages().includes(lang)) return;

  setLanguage(lang);
  try {
    await saveSettings({ language: lang });
  } catch (err) {
    console.error("Could not persist the language setting:", err);
  }

  await interaction.deferReply({ ephemeral: true });

  const languageName = t(`panelSettings.language${capitalize(lang)}`);
  await interaction.editReply(t("panelSettings.changed", { language: languageName }));

  // Re-render every panel so button labels/text reflect the new language.
  try {
    await setupPanels(client);
  } catch (err) {
    console.error("Failed to refresh panels after a language change:", err);
  }
}

module.exports = { handleSelectMenuInteraction };
