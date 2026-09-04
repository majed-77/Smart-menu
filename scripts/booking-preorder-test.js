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
  saraTableNumber: "",
  saraBookingActive: false,
  conversationHistory: [],
  saraBookingState: { name: "", phone: "", partySize: 3, date: "2026-09-04", time: "22:00", notes: "", preorderChoice: "", orderItems: [] },
  saraAwaitingOrderApproval: () => false,
  normalizeArabicDigitsSara: value => String(value).replace(/[٠-٩]/g, digit => "٠١٢٣٤٥٦٧٨٩".indexOf(digit)),
  saraBookingArgsFromState: null
};
context.saraBookingArgsFromState = () => ({ name: context.saraBookingState.name || "عميل تجريبي", phone: context.saraBookingState.phone || "+966500000001", party_size: context.saraBookingState.partySize, date: context.saraBookingState.date, time: context.saraBookingState.time, order_items: context.saraBookingState.orderItems });
vm.createContext(context);
vm.runInContext([
  "saraAwaitingPreorderChoice",
  "saraAwaitingBookingApproval",
  "normalizeSaraBookingApprovalTranscript",
  "saraCanConfirmBookingNow",
  "saraApplyAiBookingUpdate"
].map(functionSource).join("\n") + "\nglobalThis.bookingTest={awaitingChoice:saraAwaitingPreorderChoice,awaitingApproval:saraAwaitingBookingApproval,normalizeApproval:normalizeSaraBookingApprovalTranscript,canConfirm:saraCanConfirmBookingNow,applyAi:saraApplyAiBookingUpdate};", context);

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
context.conversationHistory = [{ role: "assistant", content: "البيانات صحيحة وأعتمد الحجز؟" }];
assert(test.awaitingApproval(), "The final booking summary waits for approval");
assert(test.normalizeApproval("نعم") === "نعم", "Arabic نعم stays visible as نعم while confirming internally");

context.saraBookingState.name = "";
context.saraBookingState.phone = "";
context.saraBookingState.preorderChoice = "";
test.applyAi({active:true,has_name:true,name:"ضيف تجريبي",has_phone:true,phone:"0000000000",has_party_size:false,party_size:0,has_date:false,date:"",has_time:false,time:"",has_notes:false,notes:"",has_preorder_choice:true,preorder_choice:"no"},"new_booking");
assert(context.saraBookingState.name === "ضيف تجريبي", "AI-first understanding captures a name from a rushed multi-field turn");
assert(context.saraBookingState.phone === "0000000000", "AI-first understanding captures the phone regardless of field order");
assert(context.saraBookingState.preorderChoice === "no", "AI-first understanding preserves a natural no-preorder answer");
assert(context.saraBookingState.partySize === 3 && context.saraBookingState.time === "22:00", "AI-first updates preserve booking facts not mentioned again");
test.applyAi({active:true,has_name:false,name:"",has_phone:true,phone:"1111111111",has_party_size:false,party_size:0,has_date:false,date:"",has_time:false,time:"",has_notes:false,notes:"",has_preorder_choice:false,preorder_choice:"unknown"},"new_booking");
assert(context.saraBookingState.phone === "1111111111" && context.saraBookingState.name === "ضيف تجريبي", "A correction replaces only the changed field");

console.log("\n✓ Booking pre-order behavior test passed.");
