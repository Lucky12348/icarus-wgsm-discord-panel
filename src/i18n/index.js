const en = require("./locales/en.json");
const fr = require("./locales/fr.json");
const { DEFAULT_LANGUAGE } = require("../config");

const CATALOGS = { en, fr };

let currentLanguage = CATALOGS[DEFAULT_LANGUAGE] ? DEFAULT_LANGUAGE : "fr";

function getSupportedLanguages() {
  return Object.keys(CATALOGS);
}

function getLanguage() {
  return currentLanguage;
}

function setLanguage(lang) {
  if (!CATALOGS[lang]) {
    throw new Error(`Unsupported language: ${lang}`);
  }
  currentLanguage = lang;
}

function interpolate(template, vars) {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, key) => (key in vars ? String(vars[key]) : match));
}

// Falls back to the default language, then to the raw key, so a missing
// translation never crashes an interaction.
function t(key, vars) {
  const catalog = CATALOGS[currentLanguage] || CATALOGS.fr;
  const template = catalog[key] ?? CATALOGS.fr[key] ?? key;
  return interpolate(template, vars);
}

module.exports = { t, getLanguage, setLanguage, getSupportedLanguages };
