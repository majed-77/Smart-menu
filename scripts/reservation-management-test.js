"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const source = fs.readFileSync(path.join(__dirname, "..", "public/assets/js/customer-app.js"), "utf8");

function functionSource(name) {
  const asyncStart = source.indexOf(`async function ${name}(`);
  const start = asyncStart >= 0 ? asyncStart : source.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`Missing ${name}`);
  const nextSync = source.indexOf("\nfunction ", start + 1);
  const nextAsync = source.indexOf("\nasync function ", start + 1);
  const ends = [nextSync, nextAsync].filter(value => value >= 0);
  return source.slice(start, Math.min(...ends));
}

let verifyCalls = 0;
let manageCalls = 0;
const context = {
  waiterLanguage: "ar",
  status: { textContent: "" },
  saraManagedReservation: { code: "", phone: "", verified: false, reservation: null, awaitingCode: false, awaitingPhone: false, pendingAction: null },
  saraBookingState: { date: "2026-09-10", time: "20:00" },
  saraLastConfirmedBooking: { signature: "", code: "", at: 0 },
  normalizeArabicDigitsSara: value => String(value).replace(/[٠-٩]/g, digit => "٠١٢٣٤٥٦٧٨٩".indexOf(digit)),
  saraPhoneDigitsFromSpeech: value => ((String(value).match(/\d/g) || []).join("").length >= 8 ? (String(value).match(/\d/g) || []).join("") : ""),
  freshSaraManagedReservation: () => ({ code: "", phone: "", verified: false, reservation: null, awaitingCode: false, awaitingPhone: false, pendingAction: null }),
  saraApplyVerifiedReservation(reservation) {
    context.saraManagedReservation = { ...context.saraManagedReservation, code: reservation.code, phone: reservation.phone, verified: true, reservation, awaitingCode: false, awaitingPhone: false };
  },
  fetch: async url => {
    if (url.endsWith("/verify")) {
      verifyCalls += 1;
      return { ok: true, json: async () => ({ reservation: { code: "30", name: "عميل تجريبي", phone: "+966500000001", date: "2026-09-10", time: "20:00", status: "new", orderItems: [{ name: "كابتشينو", quantity: 1, specialRequest: "بدون سكر" }] } }) };
    }
    manageCalls += 1;
    return { ok: true, json: async () => ({ reservation: { code: "30", name: "عميل تجريبي", phone: "+966500000001", date: "2026-09-10", time: "21:00", status: "new", orderItems: [{ name: "كابتشينو", quantity: 1, specialRequest: "بدون سكر" }] } }) };
  }
};
vm.createContext(context);
vm.runInContext([
  functionSource("saraSpokenReservationNumber"),
  functionSource("saraReservationCodeFromText"),
  functionSource("saraExistingReservationIntent"),
  functionSource("saraManagedReservationOrderSummary"),
  functionSource("saraManagedReservationInfoReply"),
  functionSource("saraHandleExistingReservationLookup"),
  functionSource("handleSaraReservationManagementTool")
].join("\n") + "\nglobalThis.managementTest={lookup:saraHandleExistingReservationLookup,manage:handleSaraReservationManagementTool,info:saraManagedReservationInfoReply};", context);

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
  console.log(`✓ ${message}`);
};

(async () => {
  assert(await context.managementTest.lookup("أنا بحجز طاولة لشخص اليوم الساعة عشرة بالليل") === "", "Booking time 10 is not mistaken for reservation code 10");
  assert(context.saraManagedReservation.awaitingCode === false && context.saraManagedReservation.awaitingPhone === false, "New booking speech does not enter existing-reservation verification");
  assert(/رقم الحجز/.test(await context.managementTest.lookup("أبي أعدل الحجز السابق")), "A request to edit the previous reservation immediately asks for its number");
  assert(/رقم الجوال/.test(await context.managementTest.lookup("ثلاثين")), "Sara understands a spoken Arabic reservation number and asks for the phone");
  const found = await context.managementTest.lookup("0500000001");
  assert(verifyCalls === 1 && context.saraManagedReservation.verified, "Code and phone verify the existing reservation");
  assert(/تعدّل الطلب، تغيّر الموعد، أو تلغي الحجز/.test(found), "Sara offers order, reschedule, and cancellation actions");
  assert(/كابتشينو.*بدون سكر/.test(found), "Verified lookup shows the existing reservation order");
  assert(/كابتشينو.*بدون سكر/.test(context.managementTest.info("وش كنت طالب؟")), "A later order-history question reads the verified reservation items");

  const staged = await context.managementTest.manage({ arguments: JSON.stringify({ action: "reschedule", confirmation_code: "30", phone: "+966500000001", date: "2026-09-10", time: "21:00" }) });
  assert(manageCalls === 0 && /أتأكد منك/.test(staged), "Rescheduling is staged before saving");
  const saved = await context.managementTest.manage(JSON.stringify(context.saraManagedReservation.pendingAction), { approved: true });
  assert(manageCalls === 1 && /غيّرت موعد حجزك رقم 30/.test(saved), "Approved rescheduling updates the same reservation");
  const cancelStage = await context.managementTest.manage({ arguments: JSON.stringify({ action: "cancel", confirmation_code: "30", phone: "+966500000001", date: "2026-09-10", time: "21:00" }) });
  assert(manageCalls === 1 && /ألغي حجزك رقم 30/.test(cancelStage), "Cancellation also requires confirmation");
  const cancelled = await context.managementTest.manage(JSON.stringify(context.saraManagedReservation.pendingAction), { approved: true });
  assert(manageCalls === 2 && /ألغيت حجزك رقم 30/.test(cancelled), "Approved cancellation updates the same reservation");
  console.log("\n✓ Existing reservation management test passed.");
})().catch(error => { console.error(error); process.exit(1); });
