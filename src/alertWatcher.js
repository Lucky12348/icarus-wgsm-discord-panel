const { Events } = require("discord.js");
const { ALERTS_CHANNEL_ID, WGSM_BOT_ID, PREFIX, SERVER_ID, BACKLOG_CHANNEL_ID, getWaitMs, getAutoUpdateRestartEnabled } = require("./config");
const { isBusy, runWgsmCommand } = require("./wgsmBridge");
const { t } = require("./i18n");
const { styled, COLORS } = require("./ui");

// WGSM's own "Auto Update" feature updates and stops the server by itself,
// then posts this alert - it never restarts it. This is the signal we react
// to: matches "Updated" and "Auto Update" in the embed's Status field,
// regardless of the emoji shortcode in front of it (e.g. ":orange_circle:").
const UPDATED_STATUS_PATTERN = /updated.*auto update/i;

function isAutoUpdateAlert(msg) {
  const embed = msg.embeds?.[0];
  if (!embed) return false;

  const statusField = embed.fields?.find((f) => f.name.trim().toLowerCase() === "status");
  return Boolean(statusField && UPDATED_STATUS_PATTERN.test(statusField.value));
}

async function handleAutoUpdateAlert(client, channel) {
  // Don't step on a command already in flight (manual button click, restore, etc.).
  if (isBusy()) return;

  const startCmd = `${PREFIX} start ${SERVER_ID}`;
  await channel.send(styled(t("autoUpdateAlert.restarting", { cmd: startCmd }), { color: COLORS.BRAND }));

  const result = await runWgsmCommand(client, startCmd);
  if (result.timedOut) {
    return channel.send(
      styled(t("autoUpdateAlert.restartTimeout", { seconds: Math.round(getWaitMs() / 1000), channel: BACKLOG_CHANNEL_ID }), {
        color: COLORS.DANGER,
      })
    );
  }

  return channel.send(
    styled(t("autoUpdateAlert.success", { text: result.text ?? t("common.emptyReply") }), { color: COLORS.SUCCESS })
  );
}

function attachAlertListener(client) {
  if (!ALERTS_CHANNEL_ID) return;

  client.on(Events.MessageCreate, async (msg) => {
    if (msg.channel.id !== ALERTS_CHANNEL_ID) return;
    if (WGSM_BOT_ID && msg.author.id !== WGSM_BOT_ID) return;
    if (!getAutoUpdateRestartEnabled()) return;
    if (!isAutoUpdateAlert(msg)) return;

    try {
      await handleAutoUpdateAlert(client, msg.channel);
    } catch (err) {
      console.error("Failed to auto-restart after a WGSM auto-update alert:", err);
    }
  });
}

module.exports = { attachAlertListener, isAutoUpdateAlert };
