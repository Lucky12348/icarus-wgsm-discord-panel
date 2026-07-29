const { Events } = require("discord.js");
const { PREFIX, SERVER_ID, BACKLOG_CHANNEL_ID, WGSM_BOT_ID, getWaitMs } = require("./config");

// Only one WGSM command in flight at a time, so a backlog reply can never
// be matched to the wrong pending command.
let currentCommand = null; // { cmd, afterTs, resolve, timeoutHandle }

function isBusy() {
  return currentCommand !== null;
}

function getCurrentCommand() {
  return currentCommand;
}

function buildWgsmCommand(action) {
  switch (action) {
    case "start":   return `${PREFIX} start ${SERVER_ID}`;
    case "stop":    return `${PREFIX} stop ${SERVER_ID}`;
    case "restart": return `${PREFIX} restart ${SERVER_ID}`;
    case "update":  return `${PREFIX} update ${SERVER_ID}`;
    case "info":    return `${PREFIX} list`;
    default:        return null;
  }
}

// The raw WGSM bot reply carries internal details (numeric server ID) that
// don't mean anything to someone reading the panel - drop them so the
// result reads as a plain human sentence.
const ID_PATTERN = /\s*\(ID:?\s*\d+\)/gi;

function extractReplyText(msg) {
  let text = msg.content?.trim() || "";

  if (!text && msg.embeds?.length) {
    const e = msg.embeds[0];
    text = [
      e.title ? `**${e.title}**` : "",
      e.description || "",
      ...(e.fields
        ?.filter((f) => f.name.trim().toLowerCase() !== "id")
        .map((f) => `**${f.name}**\n${f.value}`) || []),
    ].filter(Boolean).join("\n\n");
  }

  text = text.replace(ID_PATTERN, "");

  return text ? text.slice(0, 1800) : null;
}

async function runWgsmCommand(client, cmd) {
  if (currentCommand) {
    throw new Error(`A command is already running: ${currentCommand.cmd}`);
  }

  const backlogChannel = await client.channels.fetch(BACKLOG_CHANNEL_ID);
  const sentCmd = await backlogChannel.send(cmd);

  return new Promise((resolve) => {
    const entry = { cmd, afterTs: sentCmd.createdTimestamp, resolve };
    entry.timeoutHandle = setTimeout(() => {
      if (currentCommand === entry) {
        currentCommand = null;
        resolve({ timedOut: true });
      }
    }, getWaitMs());
    currentCommand = entry;
  });
}

function attachBacklogListener(client) {
  client.on(Events.MessageCreate, (msg) => {
    if (msg.channel.id !== BACKLOG_CHANNEL_ID) return;
    if (msg.author.id !== WGSM_BOT_ID) return;
    if (!currentCommand) return;
    if (msg.createdTimestamp < currentCommand.afterTs) return;

    const entry = currentCommand;
    currentCommand = null;
    clearTimeout(entry.timeoutHandle);
    entry.resolve({ text: extractReplyText(msg) });
  });
}

module.exports = {
  buildWgsmCommand,
  extractReplyText,
  isBusy,
  getCurrentCommand,
  runWgsmCommand,
  attachBacklogListener,
};
