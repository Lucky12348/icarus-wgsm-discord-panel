const { Client, GatewayIntentBits, Events } = require("discord.js");

const config = require("./src/config");
const { setLanguage } = require("./src/i18n");
const { loadSettings } = require("./src/settingsStore");
const { setupPanels } = require("./src/panels");
const { attachBacklogListener } = require("./src/wgsmBridge");
const { attachAlertListener } = require("./src/alertWatcher");
const { handleButtonInteraction } = require("./src/interactions/buttons");
const { handleSelectMenuInteraction } = require("./src/interactions/selectMenus");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once(Events.ClientReady, async () => {
  console.log(`Logged in as ${client.user.tag}`);

  try {
    const settings = await loadSettings();
    if (settings.language) setLanguage(settings.language);
    if (settings.waitMs) config.setWaitMs(settings.waitMs);
    if (typeof settings.autoUpdateRestartEnabled === "boolean") {
      config.setAutoUpdateRestartEnabled(settings.autoUpdateRestartEnabled);
    }
  } catch (err) {
    console.error("Could not load persisted settings, falling back to the default language:", err);
  }

  try {
    await setupPanels(client);
  } catch (err) {
    console.error("Failed to initialize panels (check channel IDs and bot permissions):", err);
    process.exit(1);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isButton()) {
      await handleButtonInteraction(client, interaction);
    } else if (interaction.isStringSelectMenu()) {
      await handleSelectMenuInteraction(client, interaction);
    }
  } catch (err) {
    // Contained here so a single bad interaction never takes the whole bot down.
    console.error("Error while handling an interaction:", err);
  }
});

attachBacklogListener(client);
attachAlertListener(client);

// Fatal errors exit the process on purpose: a scheduled task / service on
// the host is expected to restart it into a clean state (see scripts/).
process.on("unhandledRejection", (err) => {
  console.error("Unhandled rejection:", err);
  process.exit(1);
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught exception:", err);
  process.exit(1);
});

client.login(config.TOKEN).catch((err) => {
  console.error("Failed to log in to Discord:", err);
  process.exit(1);
});
