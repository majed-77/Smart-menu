"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const source = fs.readFileSync(path.join(__dirname, "..", "public/assets/js/customer-app.js"), "utf8");
function functionSource(name) {
  const asyncStart = source.indexOf(`async function ${name}(`);
  const start = asyncStart >= 0 ? asyncStart : source.indexOf(`function ${name}(`);
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

let saves = 0;
const context = {
  waiterLanguage: "ar",
  conversationHistory: [{ role: "user", content: "أضف كابتشينو" }],
  saraBookingState: { phone: "+966500000001", orderItems: [], preorderChoice: "no" },
  saraBookingActive: true,
  saraLastConfirmedBooking: { signature: "old", code: "30", at: Date.now() },
  saraConfirmedBookingOrderAwaitingApproval: false,
  menu: [],
  status: { textContent: "" },
  normalizeMenuLookupText: value => String(value || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim(),
  resolveSaraOrderItem: name => ({ name, canonicalName: name, aliases: [name], available: true, unitPriceSar: 20 }),
  saraModifierExtraSar: () => 0,
  saraBookingArgsFromState: () => ({}),
  saraBookingSignature: () => "new",
  fetch: async () => {
    saves += 1;
    return { ok: true, json: async () => ({ reservation: { code: "30" } }) };
  }
};
vm.createContext(context);
vm.runInContext([
  functionSource("saraOrderText"),
  functionSource("saraOrderConfirmation"),
  functionSource("saraUserGroundsMenuItem"),
  functionSource("saraOrderItemKey"),
  functionSource("saraTextGroundsAnyMenuItem"),
  functionSource("saraConfirmedBookingEditReply"),
  functionSource("saraApplyPreorderTool")
].join("\n") + "\nglobalThis.confirmedOrderTest={apply:saraApplyPreorderTool,edit:saraConfirmedBookingEditReply};", context);

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
  console.log(`✓ ${message}`);
};

(async () => {
  const editOptions = context.confirmedOrderTest.edit("طيب أقدر أعدل على الحجز؟");
  assert(/تغيّر الموعد/.test(editOptions) && /تلغي الحجز/.test(editOptions) && /تضيف وتعدّل الطلب/.test(editOptions), "A vague booking edit offers time, cancellation, and pre-order changes");

  const args = { order_items: [{ item_name: "كابتشينو", quantity: 1, special_request: "" }] };
  const staged = await context.confirmedOrderTest.apply(args);
  assert(/أعتمد تحديث الطلب/.test(staged), "A confirmed-booking order change is staged for approval");
  assert(saves === 0, "The confirmed booking is not updated before approval");

  context.conversationHistory.push({ role: "assistant", content: staged }, { role: "user", content: "اعتمد" });
  const saved = await context.confirmedOrderTest.apply(args);
  assert(saves === 1, "The approved order update is saved exactly once");
  assert(/أضفت الطلب على حجزك رقم 30/.test(saved), "The update keeps the original reservation number");

  context.saraBookingState.orderItems = [];
  context.saraConfirmedBookingOrderAwaitingApproval = false;
  context.conversationHistory.push({ role: "user", content: "لا لا أبي أضيف طلب" });
  const rejected = await context.confirmedOrderTest.apply({ order_items: [{ item_name: "كبسة دجاج", quantity: 1, special_request: "" }] });
  assert(/وش الصنف والكمية/.test(rejected), "Generic add-order intent asks for the exact item and quantity");
  assert(context.saraBookingState.orderItems.length === 0, "An AI-suggested item is not written into booking memory");
  assert(saves === 1, "An unspoken item never reaches the reservation API");
  console.log("\n✓ Confirmed booking order update test passed.");
})().catch(error => {
  console.error(error);
  process.exit(1);
});
