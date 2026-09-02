"use strict";

function cleanText(value, maxLength = 500) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function clampInteger(value, min, max, fallback = 0) {
  const parsed = Math.trunc(Number(value));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function cleanImageUrl(value) {
  const raw = cleanText(value, 1000);
  if (!raw) return "";
  if (/^\/api\/menu-images\/[0-9a-f-]{36}$/i.test(raw)) return raw;

  try {
    const url = new URL(raw);
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : "";
  } catch {
    return "";
  }
}

function normalizeMenuModifiers(value) {
  const raw = Array.isArray(value) ? value : [];
  return raw
    .slice(0, 60)
    .map((modifier, index) => ({
      type: ["addon", "option"].includes(String(modifier?.type || ""))
        ? String(modifier.type)
        : "option",
      name: cleanText(modifier?.name, 120),
      priceText: cleanText(modifier?.priceText, 40),
      sortOrder: clampInteger(modifier?.sortOrder, -1000, 1000, index)
    }))
    .filter((modifier) => modifier.name)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

module.exports = {
  clampInteger,
  cleanImageUrl,
  cleanText,
  normalizeMenuModifiers
};
