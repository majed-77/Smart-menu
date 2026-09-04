"use strict";

function normalizeArabicDigits(value) {
  return String(value || "")
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)));
}

function transcriptConfidence(transcription) {
  const values = (transcription?.logprobs || [])
    .map((entry) => Number(entry?.logprob))
    .filter(Number.isFinite);
  if (!values.length) return { available: false, average: 0, minimum: 0, weakShare: 0, count: 0 };
  return {
    available: true,
    average: values.reduce((sum, value) => sum + value, 0) / values.length,
    minimum: Math.min(...values),
    weakShare: values.filter((value) => value < -1).length / values.length,
    count: values.length
  };
}

function isWeakTranscript(transcription) {
  const confidence = transcriptConfidence(transcription);
  if (!confidence.available) return false;
  return confidence.average < -0.55 || confidence.weakShare > 0.25 ||
    (confidence.count <= 3 && confidence.minimum < -1.5);
}

function normalizeForAgreement(value) {
  return normalizeArabicDigits(value)
    .replace(/[ًٌٍَُِّْـ]/g, "")
    .replace(/[إأآ]/g, "ا")
    .replace(/[ة]/g, "ه")
    .replace(/[^\p{L}\p{N}+]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function transcriptsAgree(first, second) {
  const a = normalizeForAgreement(first);
  const b = normalizeForAgreement(second);
  return Boolean(a && b && a === b);
}

function phoneDigitsFromTranscript(value) {
  const raw = normalizeArabicDigits(value)
    .replace(/[،,.;:!?؟]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const numericCandidates = raw.match(/\+?[0-9](?:[0-9\s().-]*[0-9])?/g) || [];
  for (const candidate of numericCandidates) {
    const digits = candidate.replace(/\D/g, "");
    if (digits.length >= 8 && digits.length <= 15) {
      return `${candidate.trim().startsWith("+") ? "+" : ""}${digits}`;
    }
  }
  const words = {
    صفر: "0", زيرو: "0", واحد: "1", وحده: "1", واحدة: "1",
    اثنين: "2", إثنين: "2", اثنان: "2", ثنين: "2", ثنتين: "2",
    ثلاثة: "3", ثلاثه: "3", ثلاث: "3", اربعة: "4", أربعة: "4", اربعه: "4", اربع: "4", أربع: "4",
    خمسة: "5", خمسه: "5", خمس: "5", ستة: "6", سته: "6", ست: "6",
    سبعة: "7", سبعه: "7", سبع: "7", ثمانية: "8", ثمانيه: "8", ثمان: "8",
    تسعة: "9", تسعه: "9", تسع: "9"
  };
  let current = "";
  let best = "";
  for (const original of raw.split(/\s+/)) {
    // Keep "واحد" intact. Strip a conjunction waw only when the remaining
    // token is itself a known digit word (for example "وخمسة").
    const withoutWaw = original.startsWith("و") ? original.slice(1) : original;
    const token = Object.prototype.hasOwnProperty.call(words, original)
      ? original
      : Object.prototype.hasOwnProperty.call(words, withoutWaw) ? withoutWaw : original;
    if (/^\d$/.test(token)) current += token;
    else if (Object.prototype.hasOwnProperty.call(words, token)) current += words[token];
    else {
      if (current.length > best.length) best = current;
      current = "";
    }
  }
  if (current.length > best.length) best = current;
  return best.length >= 8 && best.length <= 15 ? best : "";
}

function isShortNameCandidate(text) {
  return /^[\u0600-\u06FF]{2,12}$/.test(String(text || "").trim());
}

function isArabicHesitation(text) {
  const normalized = normalizeForAgreement(text).replace(/\s+/g, "");
  return /^(?:ا+|ه+|اه+|اها+|ام+|مم+|هم+|ممم+|اييي+)$/.test(normalized);
}

module.exports = {
  isArabicHesitation,
  isShortNameCandidate,
  isWeakTranscript,
  normalizeForAgreement,
  phoneDigitsFromTranscript,
  transcriptConfidence,
  transcriptsAgree
};
