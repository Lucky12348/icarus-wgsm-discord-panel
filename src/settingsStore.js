const fs = require("fs/promises");
const path = require("path");

const SETTINGS_PATH = path.join(__dirname, "..", "data", "settings.json");

async function loadSettings() {
  try {
    const raw = await fs.readFile(SETTINGS_PATH, "utf8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function saveSettings(settings) {
  await fs.mkdir(path.dirname(SETTINGS_PATH), { recursive: true });
  await fs.writeFile(SETTINGS_PATH, JSON.stringify(settings, null, 2), "utf8");
}

module.exports = { loadSettings, saveSettings };
