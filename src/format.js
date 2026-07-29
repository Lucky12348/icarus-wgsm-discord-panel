const { t, getLanguage } = require("./i18n");

const DATE_LOCALES = { fr: "fr-FR", en: "en-GB" };

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function nowStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function fmtDate(d) {
  try {
    return new Intl.DateTimeFormat(DATE_LOCALES[getLanguage()] || DATE_LOCALES.fr, {
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
  if (kb < 1024) return `${Math.round(kb)} ${t("common.unitKB")}`;
  const mb = kb / 1024;
  return `${mb.toFixed(1)} ${t("common.unitMB")}`;
}

module.exports = { delay, nowStamp, fmtDate, fmtSize };
