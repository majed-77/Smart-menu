"use strict";

const assert = require("assert");
const {
  isShortNameCandidate,
  isWeakTranscript,
  phoneDigitsFromTranscript,
  transcriptsAgree
} = require("../src/features/sara/stt-quality");

assert.strictEqual(phoneDigitsFromTranscript("رقمي صفر خمسة ثلاثة ثمانية ستة اثنين ستة ثمانية تسعة تسعة"), "0538626899");
assert.strictEqual(phoneDigitsFromTranscript("٠٥٣ ٨٦٢ ٦٨٩٩"), "0538626899");
assert.strictEqual(phoneDigitsFromTranscript("الساعة 10"), "");
assert.strictEqual(transcriptsAgree("عبدالله.", "عبد الله"), false);
assert.strictEqual(transcriptsAgree("ماجد", "ماجد."), true);
assert.strictEqual(isShortNameCandidate("عبدالله"), true);
assert.strictEqual(isShortNameCandidate("الحجز باسم عبدالله"), false);
assert.strictEqual(isWeakTranscript({ logprobs:[{ logprob:-0.05 }, { logprob:-0.1 }] }), false);
assert.strictEqual(isWeakTranscript({ logprobs:[{ logprob:-0.1 }, { logprob:-2.4 }] }), true);

console.log("✓ STT confidence and phone-order checks passed.");
