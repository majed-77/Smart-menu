"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const source = fs.readFileSync(path.join(__dirname, "..", "public/assets/js/customer-app.js"), "utf8");
const start = source.indexOf("function freshSaraOrderState()");
const end = source.indexOf("function saraIsDuplicateTurn", start);
if (start < 0 || end < 0) throw new Error("Order-state helpers were not found in customer-app.js");

const context = {
  saraTableNumber: "",
  waiterLanguage: "ar",
  conversationHistory: [],
  normalizeSaraPhone(value) {
    return String(value || "").replace(/[^+\d]/g, "");
  },
  saraBookingContextActive() { return false; }
};
vm.createContext(context);
vm.runInContext(`${source.slice(start, end)}
globalThis.orderTest = {
  update: saraUpdateOrderState,
  merge: saraMergeOrderToolArgs,
  missing: saraOrderMissingField,
  reply: saraDeterministicOrderReply,
  guard: saraApplyOrderMemoryGuard,
  state: () => saraOrderState,
  setAwaiting: value => { saraOrderState.awaitingField = value; },
  clearConfirmation: () => { saraOrderState.confirmed = false; }
};`, context);

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
  console.log(`✓ ${message}`);
};
const test = context.orderTest;

test.update("أبي أطلب");
test.update("هنا بالمطعم");
test.guard("تمام، وش الاسم اللي أسجل عليه الطلب؟");
assert(test.state().awaitingField === "customerName", "Sara's name question arms deterministic name capture");
test.setAwaiting("");
test.update("اعتمديها");
const merged = test.merge({
  order_mode: "dinein",
  customer_name: "",
  phone: "",
  notes: "",
  order_items: [{ item_name: "إسبريسو", quantity: 2, special_request: "واحد بدون سكر" }]
});
assert(test.missing() === "customerName", "Dine-in confirmation is blocked until the name is present");
assert(merged.order_items.length === 1 && test.state().orderItems[0].quantity === 2, "Order items survive the missing-name turn");

test.setAwaiting("customerName");
test.clearConfirmation();
test.update("ماجد");
assert(test.state().customerName === "ماجد", "A name answer fills the pending customer-name field");
assert(test.missing() === "", "Dine-in order becomes complete after the name is supplied");
assert(test.state().confirmed === false, "Supplying the missing name requires fresh confirmation");
test.update("اعتمديها");
assert(test.state().confirmed === true, "Fresh explicit approval unlocks the completed order");
test.update("أضف كابتشينو");
assert(test.state().confirmed === false, "Any later order change invalidates stale approval");

context.conversationHistory.push({ role: "assistant", content: "وش الاسم اللي أسجل عليه الطلب؟" });
assert(/عشان/.test(test.reply("ليش")) && !/لاتيه/.test(test.reply("ليش")), "ليش is answered as why and never converted to Latte");
assert(/وش الصنف/.test(test.reply("شي ثاني")), "A vague second item triggers clarification");

console.log("\n✓ Order-flow behavior test passed.");
