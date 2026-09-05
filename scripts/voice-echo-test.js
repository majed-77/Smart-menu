"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const source = fs.readFileSync(path.join(__dirname, "../public/assets/js/customer-app.js"), "utf8");
function functionSource(name) {
  const start = source.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`Missing ${name}`);
  const brace = source.indexOf("{", start);
  let depth = 0;
  for (let i = brace; i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    if (source[i] === "}") depth -= 1;
    if (depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`Unclosed ${name}`);
}

const context = {
  saraCaptureStartedDuringSara: true,
  saraLastSpokenText: "تمام ماجد، رقم الجوال 0538626899، الحجز اليوم الساعة 03:00 لشخصين، وبدون طلب مسبق. البيانات صحيحة وأعتمد الحجز؟"
};
vm.createContext(context);
vm.runInContext([
  functionSource("saraNormalizeForEcho"),
  functionSource("saraLooksLikeSaraEcho")
].join("\n") + "\nglobalThis.echoTest=saraLooksLikeSaraEcho;", context);

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
  console.log(`✓ ${message}`);
};

assert(context.echoTest("رقم الجوال"), "A short fragment of Sara's own summary is rejected as echo");
assert(context.echoTest("الحجز اليوم الساعة 03 00 لشخصين"), "A longer fragment of Sara's summary is rejected as echo");
assert(!context.echoTest("نعم اعتمدي"), "A real short approval remains a valid barge-in");
assert(!context.echoTest("الرقم غلط"), "A guest correction is not suppressed");
context.saraCaptureStartedDuringSara = false;
assert(!context.echoTest("رقم الجوال"), "Normal guest turns are never classified as speaker echo");

console.log("\n✓ Sara echo-gate behavior test passed.");
