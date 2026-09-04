"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const source = fs.readFileSync(path.join(__dirname, "../public/assets/js/customer-app.js"), "utf8");
const encoderSource = source.match(/function saraEncodeWav\([\s\S]+?(?=\nfunction startSaraCapture)/)?.[0];
assert.ok(encoderSource, "PCM WAV encoder must remain present");

// Evaluate only the self-contained encoder, not the browser application.
const encode = Function(`${encoderSource}; return saraEncodeWav;`)();

(async () => {
  const samples = new Float32Array([-1, -0.5, 0, 0.5, 1]);
  const blob = encode([samples], samples.length, 48000);
  assert.strictEqual(blob.type, "audio/wav");
  const bytes = Buffer.from(await blob.arrayBuffer());
  assert.strictEqual(bytes.toString("ascii", 0, 4), "RIFF");
  assert.strictEqual(bytes.toString("ascii", 8, 12), "WAVE");
  assert.strictEqual(bytes.readUInt32LE(24), 48000);
  assert.strictEqual(bytes.readUInt32LE(40), samples.length * 2);
  assert.strictEqual(bytes.length, 44 + samples.length * 2);
  assert.ok(bytes.readInt16LE(44) <= -32767);
  assert.ok(bytes.readInt16LE(52) >= 32766);

  assert.ok(source.includes("saraPcmSampleRate*0.9"), "normal turns need 900ms pre-roll");
  assert.ok(source.includes("duringSara?0.45:0.9"), "barge-in needs a shorter echo-safe prefix");
  assert.ok(source.includes("endSilenceMs=1800"), "end silence must stay at 1.8 seconds");
  console.log("✓ PCM pre-roll and WAV encoding checks passed.");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
