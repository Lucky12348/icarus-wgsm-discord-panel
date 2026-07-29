const fs = require("fs/promises");
const path = require("path");
const { PROSPECTS_DIR } = require("./config");
const { nowStamp } = require("./format");

async function ensureProspectsDir() {
  if (!PROSPECTS_DIR) throw new Error("PROSPECTS_DIR is missing from .env");
  await fs.access(PROSPECTS_DIR);
}

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

module.exports = {
  ensureProspectsDir,
  listMapsWithLastSave,
  listBackupsForMap,
  restoreBackup,
};
