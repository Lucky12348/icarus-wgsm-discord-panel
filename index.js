require("dotenv").config();
const fs = require("fs/promises");
const path = require("path");

const {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Events,
  StringSelectMenuBuilder,
} = require("discord.js");

/* ================== CONFIG ================== */

const TOKEN = process.env.DISCORD_TOKEN;

const PANEL_CHANNEL_ID = process.env.PANEL_CHANNEL_ID;
const BACKLOG_CHANNEL_ID = process.env.BACKLOG_CHANNEL_ID;

const SERVER_ID = process.env.SERVER_ID;
const PREFIX = process.env.CMD_PREFIX || "!wgsm";
const WGSM_BOT_ID = process.env.WGSM_BOT_ID;
const WAIT_MS = Number(process.env.WAIT_MS || 20000);

// Backups
const BACKUPS_CHANNEL_ID = process.env.BACKUPS_CHANNEL_ID;
const BACKUPS_LOG_CHANNEL_ID = process.env.BACKUPS_LOG_CHANNEL_ID;
const PROSPECTS_DIR = process.env.PROSPECTS_DIR;

/* ================== STATE ================== */

// Backlog commands pending: cmdMessageId -> data
const pending = new Map();

// Backups session per user (to keep context between menus)
const backupSessions = new Map(); // userId -> { mapName }

/* ================== HELPERS ================== */

function fmtDate(d) {
  try {
    return new Intl.DateTimeFormat("fr-FR", {
      timeZone: "Europe/Paris",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  } catch {
    return d.toISOString();
  }
}

function fmtSize(bytes) {
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} Ko`;
  const mb = kb / 1024;
  return `${mb.toFixed(1)} Mo`;
}

function nowStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
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

function extractReplyText(msg) {
  let text = msg.content?.trim() || "";

  if (!text && msg.embeds?.length) {
    const e = msg.embeds[0];
    text = [
      e.title ? `**${e.title}**` : "",
      e.description || "",
      ...(e.fields?.map((f) => `**${f.name}**\n${f.value}`) || []),
    ].filter(Boolean).join("\n\n");
  }

  return (text || "✅ Réponse reçue (contenu vide)").slice(0, 1800);
}

async function clearChannel(channel) {
  // Supprime tout (attention: nécessite "Gérer les messages")
  let fetched;
  do {
    fetched = await channel.messages.fetch({ limit: 100 });
    if (!fetched.size) break;

    for (const msg of fetched.values()) {
      await msg.delete().catch(() => {});
    }
  } while (fetched.size >= 2);
}

async function ensureProspectsDir() {
  if (!PROSPECTS_DIR) throw new Error("PROSPECTS_DIR manquant dans .env");
  // Just test access
  await fs.access(PROSPECTS_DIR);
}

/* ================== BACKUPS: LISTING ================== */

async function listMapsWithLastSave() {
  await ensureProspectsDir();

  const entries = await fs.readdir(PROSPECTS_DIR, { withFileTypes: true });
  const maps = [];

  for (const e of entries) {
    if (!e.isFile()) continue;
    const name = e.name;

    // Active save = MAP.json (and NOT backups)
    if (!name.endsWith(".json")) continue;
    if (name.includes(".json.backup")) continue;

    const mapName = name.replace(/\.json$/i, "");
    const fullPath = path.join(PROSPECTS_DIR, name);

    try {
      const st = await fs.stat(fullPath);
      maps.push({
        mapName,
        fileName: name,
        fullPath,
        mtime: st.mtime,
      });
    } catch {
      // ignore
    }
  }

  // Most recently modified first
  maps.sort((a, b) => b.mtime - a.mtime);
  return maps;
}

async function listBackupsForMap(mapName) {
  await ensureProspectsDir();

  const entries = await fs.readdir(PROSPECTS_DIR, { withFileTypes: true });
  const backups = [];

  const activeName = `${mapName}.json`;
  const activePath = path.join(PROSPECTS_DIR, activeName);

  // Include active as "info"
  try {
    const st = await fs.stat(activePath);
    backups.push({
      kind: "active",
      display: activeName,
      fileName: activeName,
      fullPath: activePath,
      mtime: st.mtime,
      size: st.size,
    });
  } catch {
    // active might not exist
  }

  const prefix1 = `${mapName}.json.backup`;
  for (const e of entries) {
    if (!e.isFile()) continue;
    const name = e.name;

    // backups can be: map.json.backup, map.json.backup_1, etc.
    if (!name.startsWith(prefix1)) continue;

    const fullPath = path.join(PROSPECTS_DIR, name);
    try {
      const st = await fs.stat(fullPath);
      backups.push({
        kind: "backup",
        display: name,
        fileName: name,
        fullPath,
        mtime: st.mtime,
        size: st.size,
      });
    } catch {
      // ignore
    }
  }

  // newest first (active included; keep active on top or sort too)
  backups.sort((a, b) => b.mtime - a.mtime);
  return backups;
}

/* ================== BACKUPS: RESTORE ================== */

async function restoreBackup(mapName, backupFileName) {
  await ensureProspectsDir();

  const activePath = path.join(PROSPECTS_DIR, `${mapName}.json`);
  const backupPath = path.join(PROSPECTS_DIR, backupFileName);

  // Validate backup exists
  await fs.access(backupPath);

  // Move active away (if exists)
  let preRestorePath = null;
  try {
    await fs.access(activePath);
    preRestorePath = `${activePath}.pre_restore_${nowStamp()}`;
    await fs.rename(activePath, preRestorePath);
  } catch {
    // no active save -> ok
  }

  // Rename backup to active (consumes backup)
  await fs.rename(backupPath, activePath);

  return { activePath, preRestorePath };
}

/* ================== CLIENT ================== */

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

/* ================== READY ================== */

client.once(Events.ClientReady, async () => {
  console.log(`✅ Connecté en tant que ${client.user.tag}`);

  // --- PANEL WGSM ---
  const panelChannel = await client.channels.fetch(PANEL_CHANNEL_ID);
  await clearChannel(panelChannel);

  const wgsmRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("wgsm_start").setLabel("Start").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("wgsm_stop").setLabel("Stop").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("wgsm_restart").setLabel("Restart").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("wgsm_update").setLabel("Update").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("wgsm_info").setLabel("Info").setStyle(ButtonStyle.Secondary),
  );

  await panelChannel.send({
    content: `🎮 **Panel WindowsGSM**\n➡️ Exécution & logs dans <#${BACKLOG_CHANNEL_ID}>`,
    components: [wgsmRow],
  });

  // --- PANEL BACKUPS ---
  if (BACKUPS_CHANNEL_ID) {
    const backupsChannel = await client.channels.fetch(BACKUPS_CHANNEL_ID);
    await clearChannel(backupsChannel);

    const backupsRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("bk_open").setLabel("Gérer les sauvegardes").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("bk_refresh").setLabel("Actualiser").setStyle(ButtonStyle.Secondary),
    );

    await backupsChannel.send({
      content:
        `📦 **Backups Icarus**\n` +
        `📁 Dossier: \`${PROSPECTS_DIR}\`\n` +
        `📝 Log: <#${BACKUPS_LOG_CHANNEL_ID}>`,
      components: [backupsRow],
    });
  }
});

/* ================== WGSM BUTTONS ================== */

async function sendWgsmCommand(cmd, interaction) {
  const backlogChannel = await client.channels.fetch(BACKLOG_CHANNEL_ID);

  // Envoi de la commande dans le backlog
  const sentCmd = await backlogChannel.send(cmd);

  // Store pending
  pending.set(sentCmd.id, {
    interaction,
    cmd,
    afterTs: sentCmd.createdTimestamp,
    createdAt: Date.now(),
  });

  return sentCmd.id;
}

client.on(Events.InteractionCreate, async (interaction) => {
  // --- BUTTONS ---
  if (interaction.isButton()) {
    // ⚠️ garde ta logique d’autorisation comme tu veux
    if (!interaction.memberPermissions?.has("Administrator")) {
      return interaction.reply({ content: "⛔ Vous n’avez pas la permission.", ephemeral: true });
    }

    // WGSM panel buttons
    if (interaction.customId.startsWith("wgsm_")) {
      const action = interaction.customId.replace("wgsm_", "");
      const cmd = buildWgsmCommand(action);
      if (!cmd) return interaction.reply({ content: "Commande inconnue.", ephemeral: true });

      await interaction.deferReply({ ephemeral: true });
      await sendWgsmCommand(cmd, interaction);

      return interaction.editReply(`✅ Commande envoyée : \`${cmd}\`\n⏳ Attente de la réponse...`);
    }

    // Backups buttons
    if (interaction.customId === "bk_open" || interaction.customId === "bk_refresh") {
      await interaction.deferReply({ ephemeral: true });

      let maps;
      try {
        maps = await listMapsWithLastSave();
      } catch (e) {
        return interaction.editReply(`❌ Impossible de lire les sauvegardes.\nDétail: \`${String(e.message || e)}\``);
      }

      if (!maps.length) {
        return interaction.editReply("⚠️ Aucune map trouvée (aucun fichier `*.json` actif).");
      }

      const options = maps.slice(0, 25).map((m) => ({
        label: m.mapName,
        value: m.mapName,
        description: `Dernière save: ${fmtDate(m.mtime)}`,
      }));

      const select = new StringSelectMenuBuilder()
        .setCustomId(`bk_map_select:${interaction.user.id}`)
        .setPlaceholder("Choisir une map…")
        .addOptions(options);

      const row = new ActionRowBuilder().addComponents(select);

      return interaction.editReply({
        content: "Sélectionne une **map** pour voir ses backups (avec date/heure).",
        components: [row],
      });
    }

    // Confirm restore
    if (interaction.customId.startsWith("bk_confirm:")) {
      await interaction.deferReply({ ephemeral: true });

      const parts = interaction.customId.split(":"); // bk_confirm:userId:map:backupFile
      const userId = parts[1];
      const mapName = decodeURIComponent(parts[2] || "");
      const backupFile = decodeURIComponent(parts.slice(3).join(":") || "");

      if (interaction.user.id !== userId) {
        return interaction.editReply("⛔ Cette action ne vous est pas destinée.");
      }

      // Restore
      let restoreInfo;
      try {
        restoreInfo = await restoreBackup(mapName, backupFile);
      } catch (e) {
        return interaction.editReply(`❌ Restauration impossible.\nDétail: \`${String(e.message || e)}\``);
      }

      // Log restore
      try {
        const logChannel = await client.channels.fetch(BACKUPS_LOG_CHANNEL_ID);
        await logChannel.send(
          `📦 **Restore**\n` +
          `👤 User: <@${interaction.user.id}>\n` +
          `🗺️ Map: **${mapName}**\n` +
          `⬅️ Backup: \`${backupFile}\`\n` +
          `➡️ Active: \`${mapName}.json\`\n` +
          `${restoreInfo.preRestorePath ? `🛟 Ancienne active: \`${path.basename(restoreInfo.preRestorePath)}\`\n` : ""}` +
          `🕒 ${fmtDate(new Date())}`
        );
      } catch {
        // ignore logging failures
      }

      // Auto restart server
      const restartCmd = `${PREFIX} restart ${SERVER_ID}`;
      await sendWgsmCommand(restartCmd, interaction);

      return interaction.editReply(
        `✅ Backup restauré : \`${backupFile}\` → \`${mapName}.json\`\n` +
        `🔄 Redémarrage demandé : \`${restartCmd}\`\n` +
        `⏳ Attente de la réponse...`
      );
    }

    if (interaction.customId.startsWith("bk_cancel:")) {
      await interaction.deferReply({ ephemeral: true });
      const userId = interaction.customId.split(":")[1];
      if (interaction.user.id !== userId) {
        return interaction.editReply("⛔ Cette action ne vous est pas destinée.");
      }
      return interaction.editReply("❎ Annulé.");
    }
  }

  // --- SELECT MENUS ---
  if (interaction.isStringSelectMenu()) {
    // Map selection
    if (interaction.customId.startsWith("bk_map_select:")) {
      const userId = interaction.customId.split(":")[1];
      if (interaction.user.id !== userId) {
        return interaction.reply({ content: "⛔ Ce menu ne vous est pas destiné.", ephemeral: true });
      }

      const mapName = interaction.values[0];
      backupSessions.set(interaction.user.id, { mapName });

      await interaction.deferReply({ ephemeral: true });

      let backups;
      try {
        backups = await listBackupsForMap(mapName);
      } catch (e) {
        return interaction.editReply(`❌ Impossible de lister les backups.\nDétail: \`${String(e.message || e)}\``);
      }

      const onlyBackups = backups.filter((b) => b.kind === "backup");
      if (!onlyBackups.length) {
        return interaction.editReply(`⚠️ Aucun backup trouvé pour **${mapName}** (fichiers \`${mapName}.json.backup*\`).`);
      }

      const options = onlyBackups.slice(0, 25).map((b) => ({
        label: b.fileName,
        value: b.fileName,
        description: `${fmtDate(b.mtime)} • ${fmtSize(b.size)}`,
      }));

      const select = new StringSelectMenuBuilder()
        .setCustomId(`bk_backup_select:${interaction.user.id}:${encodeURIComponent(mapName)}`)
        .setPlaceholder("Choisir un backup à restaurer…")
        .addOptions(options);

      const row = new ActionRowBuilder().addComponents(select);

      return interaction.editReply({
        content: `Map: **${mapName}**\nChoisis un **backup** (date/heure + taille).`,
        components: [row],
      });
    }

    // Backup selection
    if (interaction.customId.startsWith("bk_backup_select:")) {
      const parts = interaction.customId.split(":");
      const userId = parts[1];
      const mapName = decodeURIComponent(parts.slice(2).join(":") || "");

      if (interaction.user.id !== userId) {
        return interaction.reply({ content: "⛔ Ce menu ne vous est pas destiné.", ephemeral: true });
      }

      const backupFile = interaction.values[0];

      await interaction.deferReply({ ephemeral: true });

      // show confirmation
      const confirmRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`bk_confirm:${interaction.user.id}:${encodeURIComponent(mapName)}:${encodeURIComponent(backupFile)}`)
          .setLabel("Confirmer la restauration")
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId(`bk_cancel:${interaction.user.id}`)
          .setLabel("Annuler")
          .setStyle(ButtonStyle.Secondary)
      );

      // get info (mtime) for user clarity
      let infoLine = "";
      try {
        const st = await fs.stat(path.join(PROSPECTS_DIR, backupFile));
        infoLine = `🕒 Backup: **${fmtDate(st.mtime)}** • ${fmtSize(st.size)}`;
      } catch {
        // ignore
      }

      return interaction.editReply({
        content:
          `⚠️ **Confirmation**\n` +
          `Map: **${mapName}**\n` +
          `Backup choisi: \`${backupFile}\`\n` +
          `${infoLine ? `${infoLine}\n` : ""}` +
          `➡️ Cela va renommer l'actuel \`${mapName}.json\` en \`.pre_restore_...\` puis activer ce backup.\n` +
          `🔄 Ensuite, le serveur sera **redémarré automatiquement**.`,
        components: [confirmRow],
      });
    }
  }
});

/* ================== RÉPONSES BOT WGSM (BACKLOG) ================== */

client.on(Events.MessageCreate, async (msg) => {
  if (msg.channel.id !== BACKLOG_CHANNEL_ID) return;
  if (msg.author.id !== WGSM_BOT_ID) return;

  const candidates = [...pending.entries()]
    .map(([k, v]) => ({ key: k, ...v }))
    .filter((v) => msg.createdTimestamp >= v.afterTs)
    .sort((a, b) => a.afterTs - b.afterTs);

  if (!candidates.length) return;

  const match = candidates[0];
  pending.delete(match.key);

  const resultText = extractReplyText(msg);

  try {
    await match.interaction.editReply(
      `🧾 **Résultat :**\n\`\`\`\n${resultText}\n\`\`\``
    );
  } catch {
    try {
      await match.interaction.user.send(`Résultat:\n\n${resultText}`);
    } catch {}
  }
});

/* ================== TIMEOUT CLEANUP ================== */

setInterval(() => {
  const now = Date.now();
  for (const [k, data] of pending.entries()) {
    if (now - data.createdAt > WAIT_MS) {
      data.interaction
        .editReply(
          `⚠️ Aucune réponse détectée en ${Math.round(WAIT_MS / 1000)}s.\n` +
          `👉 Vérifie <#${BACKLOG_CHANNEL_ID}>.`
        )
        .catch(() => {});
      pending.delete(k);
    }
  }
}, 3000);

/* ================== LOGIN ================== */

client.login(TOKEN);
