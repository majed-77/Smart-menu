"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const source = fs.readFileSync(path.join(__dirname, "..", "public/assets/js/customer-app.js"), "utf8");
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
  waiterLanguage: "ar",
  conversationHistory: [],
  saraBookingState: { preorderChoice: "", orderItems: [] },
  saraBookingArgsFromState: null
};
context.saraBookingArgsFromState = () => ({ name: "عميل تجريبي", phone: "+966500000001", party_size: 2, date: "2026-09-04", time: "20:00", order_items: context.saraBookingState.orderItems });
vm.createContext(context);
vm.runInContext([
  "saraAwaitingPreorderChoice",
  "saraAwaitingBookingApproval",
  "saraCanConfirmBookingNow"
].map(functionSource).join("\n") + "\nglobalThis.bookingTest={awaitingChoice:saraAwaitingPreorderChoice,awaitingApproval:saraAwaitingBookingApproval,canConfirm:saraCanConfirmBookingNow};", context);

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
  console.log(`✓ ${message}`);
};
const test = context.bookingTest;

context.conversationHistory = [{ role: "assistant", content: "قبل أعتمد الحجز، ودك تضيف طلب مسبق من المنيو ولا بدون طلب؟" }];
assert(test.awaitingChoice(), "The mandatory pre-order question is recognized");
assert(!test.awaitingApproval(), "A yes/no pre-order answer cannot be mistaken for booking approval");
assert(!test.canConfirm(), "Booking cannot be confirmed before the pre-order choice");

context.saraBookingState.preorderChoice = "no";
assert(test.canConfirm(), "Choosing no pre-order unlocks final booking confirmation");
context.saraBookingState.preorderChoice = "yes";
assert(!test.canConfirm(), "Choosing a pre-order requires at least one exact item");
context.saraBookingState.orderItems = [{ item_name: "كابتشينو", quantity: 1, special_request: "" }];
assert(test.canConfirm(), "A concrete pre-order unlocks final booking confirmation");

context.conversationHistory = [{ role: "assistant", content: "تم، اعتمدت الحجز بنجاح. رقم حجزك 30." }];
assert(!test.awaitingApproval(), "A booking success message cannot trigger duplicate approval");

console.log("\n✓ Booking pre-order behavior test passed.");
