const { ActionRowBuilder, StringSelectMenuBuilder } = require("discord.js");
const path = require("path");
const { t } = require("../i18n");
const { PREFIX, SERVER_ID, BACKLOG_CHANNEL_ID, BACKUPS_LOG_CHANNEL_ID, getWaitMs } = require("../config");
const { buildWgsmCommand, isBusy, getCurrentCommand, runWgsmCommand } = require("../wgsmBridge");
const { listMapsWithLastSave, restoreBackup } = require("../backups");
const { fmtDate, delay } = require("../format");
const { styled, COLORS } = require("../ui");

// WGSM refuses to update a running server with this exact kind of reply
// ("Server (ID: 1) currently in Started state, not able to update.") -
// matching on the stable core phrase rather than the full sentence.
const UPDATE_BLOCKED_PATTERN = /not able to update/i;

async function handleButtonInteraction(client, interaction) {
  const { customId } = interaction;

  if (customId.startsWith("wgsm_")) {
    return handleWgsmButton(client, interaction);
  }
  if (customId === "bk_open" || customId === "bk_refresh") {
    return handleBackupsOpen(interaction);
  }
  if (customId.startsWith("bk_confirm:")) {
    return handleBackupConfirm(client, interaction);
  }
  if (customId.startsWith("bk_cancel:")) {
    return handleBackupCancel(interaction);
  }
}

async function handleWgsmButton(client, interaction) {
  const action = interaction.customId.replace("wgsm_", "");
  const cmd = buildWgsmCommand(action);
  if (!cmd) {
    return interaction.reply(styled(t("errors.unknownCommand"), { color: COLORS.DANGER, ephemeral: true }));
  }

  if (isBusy()) {
    return interaction.reply(
      styled(t("errors.commandBusy", { cmd: getCurrentCommand().cmd }), { color: COLORS.WARNING, ephemeral: true })
    );
  }

  await interaction.deferReply({ ephemeral: true });

  if (action === "update") {
    return handleUpdate(client, interaction, cmd);
  }

  const result = await runWgsmCommand(client, cmd);

  if (result.timedOut) {
    return interaction.editReply(
      styled(t("errors.commandTimeout", { seconds: Math.round(getWaitMs() / 1000), channel: BACKLOG_CHANNEL_ID }), {
        color: COLORS.DANGER,
      })
    );
  }

  return interaction.editReply(
    styled(t("result.generic", { text: result.text ?? t("common.emptyReply") }), { color: COLORS.SUCCESS })
  );
}

// WGSM won't update a running server, so if it refuses for that reason we
// stop it, retry the update, then restart it automatically - no more manual
// stop-then-update dance.
async function handleUpdate(client, interaction, updateCmd) {
  const firstAttempt = await runWgsmCommand(client, updateCmd);

  if (firstAttempt.timedOut) {
    return interaction.editReply(
      styled(t("errors.commandTimeout", { seconds: Math.round(getWaitMs() / 1000), channel: BACKLOG_CHANNEL_ID }), {
        color: COLORS.DANGER,
      })
    );
  }

  if (!firstAttempt.text || !UPDATE_BLOCKED_PATTERN.test(firstAttempt.text)) {
    return interaction.editReply(
      styled(t("result.generic", { text: firstAttempt.text ?? t("common.emptyReply") }), { color: COLORS.SUCCESS })
    );
  }

  // Server is running - stop it first.
  const stopCmd = `${PREFIX} stop ${SERVER_ID}`;
  await interaction.editReply(styled(t("update.stopping", { cmd: stopCmd }), { color: COLORS.BRAND }));

  const stopResult = await runWgsmCommand(client, stopCmd);
  if (stopResult.timedOut) {
    return interaction.editReply(
      styled(t("update.stopTimeout", { seconds: Math.round(getWaitMs() / 1000), channel: BACKLOG_CHANNEL_ID }), {
        color: COLORS.DANGER,
      })
    );
  }

  // Small grace period so the OS releases file handles after shutdown.
  await delay(3000);

  await interaction.editReply(styled(t("update.updating", { cmd: updateCmd }), { color: COLORS.BRAND }));
  const updateResult = await runWgsmCommand(client, updateCmd);

  if (updateResult.timedOut) {
    return interaction.editReply(
      styled(t("update.updateTimeout", { seconds: Math.round(getWaitMs() / 1000), channel: BACKLOG_CHANNEL_ID }), {
        color: COLORS.DANGER,
      })
    );
  }

  if (updateResult.text && UPDATE_BLOCKED_PATTERN.test(updateResult.text)) {
    return interaction.editReply(styled(t("update.stillBlocked", { text: updateResult.text }), { color: COLORS.DANGER }));
  }

  // Bring the server back up now that the update is done.
  const startCmd = `${PREFIX} start ${SERVER_ID}`;
  await interaction.editReply(styled(t("update.restarting", { cmd: startCmd }), { color: COLORS.BRAND }));

  const startResult = await runWgsmCommand(client, startCmd);
  if (startResult.timedOut) {
    return interaction.editReply(
      styled(t("update.restartTimeout", { seconds: Math.round(getWaitMs() / 1000), channel: BACKLOG_CHANNEL_ID }), {
        color: COLORS.DANGER,
      })
    );
  }

  return interaction.editReply(
    styled(t("update.success", { text: updateResult.text ?? t("common.emptyReply") }), { color: COLORS.SUCCESS })
  );
}

async function handleBackupsOpen(interaction) {
  await interaction.deferReply({ ephemeral: true });

  let maps;
  try {
    maps = await listMapsWithLastSave();
  } catch (e) {
    return interaction.editReply(
      styled(t("errors.listMapsFailed", { error: String(e.message || e) }), { color: COLORS.DANGER })
    );
  }

  if (!maps.length) {
    return interaction.editReply(styled(t("errors.noMaps"), { color: COLORS.DANGER }));
  }

  const options = maps.slice(0, 25).map((m) => ({
    label: m.mapName,
    value: m.mapName,
    description: fmtDate(m.mtime),
  }));

  const select = new StringSelectMenuBuilder()
    .setCustomId(`bk_map_select:${interaction.user.id}`)
    .setPlaceholder(t("backupFlow.selectMapPlaceholder"))
    .addOptions(options);

  return interaction.editReply(
    styled(t("backupFlow.selectMapPrompt"), {
      color: COLORS.BRAND,
      actionRows: [new ActionRowBuilder().addComponents(select)],
    })
  );
}

async function handleBackupConfirm(client, interaction) {
  await interaction.deferReply({ ephemeral: true });

  const parts = interaction.customId.split(":"); // bk_confirm:userId:map:backupFile
  const userId = parts[1];
  const mapName = decodeURIComponent(parts[2] || "");
  const backupFile = decodeURIComponent(parts.slice(3).join(":") || "");

  if (interaction.user.id !== userId) {
    return interaction.editReply(styled(t("common.notYourAction"), { color: COLORS.DANGER }));
  }

  if (isBusy()) {
    return interaction.editReply(
      styled(t("errors.commandBusyRetry", { cmd: getCurrentCommand().cmd }), { color: COLORS.WARNING })
    );
  }

  // 1. Stop the server before touching the save file - otherwise it may be
  //    locked, or overwritten by the still-running server, on Windows.
  const stopCmd = `${PREFIX} stop ${SERVER_ID}`;
  await interaction.editReply(styled(t("restore.stopping", { cmd: stopCmd }), { color: COLORS.BRAND }));

  const stopResult = await runWgsmCommand(client, stopCmd);
  if (stopResult.timedOut) {
    return interaction.editReply(
      styled(t("restore.stopTimeout", { seconds: Math.round(getWaitMs() / 1000), channel: BACKLOG_CHANNEL_ID }), {
        color: COLORS.DANGER,
      })
    );
  }

  // Small grace period so the OS releases the file handle after shutdown.
  await delay(3000);

  // 2. Restore
  let restoreInfo;
  try {
    restoreInfo = await restoreBackup(mapName, backupFile);
  } catch (e) {
    return interaction.editReply(
      styled(t("restore.failed", { error: String(e.message || e) }), { color: COLORS.DANGER })
    );
  }

  // Log restore
  try {
    const logChannel = await client.channels.fetch(BACKUPS_LOG_CHANNEL_ID);
    await logChannel.send(
      styled(
        t("restore.logEntry", {
          userId: interaction.user.id,
          map: mapName,
          backup: backupFile,
          preRestoreLine: restoreInfo.preRestorePath
            ? t("restore.preRestoreLine", { file: path.basename(restoreInfo.preRestorePath) })
            : "",
          date: fmtDate(new Date()),
        }),
        { color: COLORS.NEUTRAL }
      )
    );
  } catch {
    // ignore logging failures
  }

  // 3. Restart the server
  const startCmd = `${PREFIX} start ${SERVER_ID}`;
  await interaction.editReply(
    styled(t("restore.starting", { backup: backupFile, map: mapName, cmd: startCmd }), { color: COLORS.BRAND })
  );

  const startResult = await runWgsmCommand(client, startCmd);
  if (startResult.timedOut) {
    return interaction.editReply(
      styled(
        t("restore.startTimeout", {
          backup: backupFile,
          map: mapName,
          seconds: Math.round(getWaitMs() / 1000),
          channel: BACKLOG_CHANNEL_ID,
        }),
        { color: COLORS.DANGER }
      )
    );
  }

  return interaction.editReply(
    styled(
      t("restore.success", { backup: backupFile, map: mapName, text: startResult.text ?? t("common.emptyReply") }),
      { color: COLORS.SUCCESS }
    )
  );
}

async function handleBackupCancel(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const userId = interaction.customId.split(":")[1];
  if (interaction.user.id !== userId) {
    return interaction.editReply(styled(t("common.notYourAction"), { color: COLORS.DANGER }));
  }
  return interaction.editReply(styled(t("common.cancelled"), { color: COLORS.NEUTRAL }));
}

module.exports = { handleButtonInteraction };
