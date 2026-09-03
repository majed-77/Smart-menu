"use strict";

const fs = require("fs");
const path = require("path");
const { BASE_CATEGORIES, BASE_MENU_ITEMS } = require("../src/data/base-menu");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const customerHtml = read("public/index.html");
const dashboardHtml = read("public/restaurant-dashboard.html");
const customerJs = read("public/assets/js/customer-app.js");
const dashboardJs = read("public/assets/js/dashboard-app.js");
const saraRoutes = read("src/features/sara/sara-routes.js");
const appSource = read("src/app.js");
const envSource = read("src/config/env.js");
const orderSource = read("src/features/orders/orders-service.js");
const routeSources = [
  appSource,
  read("src/features/menu/menu-routes.js"),
  read("src/features/restaurant/restaurant-routes.js"),
  read("src/features/orders/orders-routes.js"),
  saraRoutes
].join("\n");

const checks = [];
const check = (name, condition) => checks.push({ name, ok: Boolean(condition) });

check("16 menu categories", BASE_CATEGORIES.length === 16);
check("138 base menu items", BASE_MENU_ITEMS.length === 138);
check("Arabic is canonical for base item names", BASE_MENU_ITEMS.every((item) => /[\u0600-\u06FF]/.test(item.nameAr)));
check("Arabic descriptions exist", BASE_MENU_ITEMS.every((item) => String(item.descriptionAr || "").trim()));
check("Base prices contain no DT/TND", BASE_MENU_ITEMS.every((item) => !/(?:\bDT\b|TND)/i.test(String(item.priceText))));
check("Unique base item keys", new Set(BASE_MENU_ITEMS.map((item) => item.itemKey)).size === BASE_MENU_ITEMS.length);

check("Customer page loads external JS", /\/assets\/js\/customer-app\.js/.test(customerHtml));
check("Dashboard loads external JS", /\/assets\/js\/dashboard-app\.js/.test(dashboardHtml));
check("Customer assets are version 6.0.23", customerHtml.includes("customer.css?v=6.0.23") && customerHtml.includes("customer-app.js?v=6.0.23"));
check("No AI engine picker remains", !customerHtml.includes("data-sara-engine") && !customerHtml.includes("enginePicker"));
check("Only retained Sara client route is used", customerJs.includes("'/api/sara-chat'") && customerJs.includes("'/api/cartesia-tts'"));
check("Deleted client engines are absent", !/(saraEngine|startRealtime|startAgent2|startAltSara|ElevenLabs|DeepSeek|Claude|Gemini|Kimi|Fish Audio)/i.test(customerJs));

check("OpenAI Sara chat route exists", saraRoutes.includes('router.post("/sara-chat"'));
check("Deepgram STT remains", saraRoutes.includes("api.deepgram.com/v1/listen") && saraRoutes.includes('deepgram-stt'));
check("OpenAI Arabic STT remains", saraRoutes.includes('"gpt-4o-transcribe"') && saraRoutes.includes('req.body.mode === "sara"'));
check("Cartesia TTS remains", saraRoutes.includes("https://api.cartesia.ai/tts/bytes"));
check("Saudi Cartesia voice remains", envSource.includes("731ace69-ee17-41bc-8c6f-665c9f1db95c"));
check("Deleted server engines are absent", !/(realtime-call|sara-alt|deepgram-tts|ElevenLabs|DeepSeek|Fish Audio|Claude|Gemini|Kimi|anthropic|moonshot)/i.test(saraRoutes));
check("Deleted provider env keys are absent", !/(DEEPSEEK|ANTHROPIC|GEMINI|KIMI|MOONSHOT|ELEVENLABS|FISH_AUDIO|DEEPGRAM_TTS)/.test(envSource));

check("Order intent locks to fulfillment question", saraRoutes.includes("ORDER INTENT LOCK") && saraRoutes.includes("تبي طلبك هنا بالمطعم ولا استلام خارجي؟"));
check("Order flow does not re-offer booking", saraRoutes.includes("Do not offer table reservation again"));
check("Order state is sent to Sara", customerJs.includes("orderState:saraOrderState") && saraRoutes.includes("KNOWN ORDER STATE FROM THE WEBSITE"));
check("Incomplete orders are blocked before save", customerJs.includes("saraOrderMissingField") && customerJs.includes("saraOrderState.awaitingField=missing"));
check("Dine-in name and pickup phone are required before approval", saraRoutes.includes("Dine-in requires customerName before approval") && saraRoutes.includes("External pickup requires customerName and phone before approval"));
check("Arabic why cannot become a menu item", customerJs.includes("/^(ليش|ليه)$/") && saraRoutes.includes('Arabic "ليش" and "ليه"'));
check("Vague second item requires clarification", customerJs.includes("وش الصنف الثاني اللي تبيه؟") && saraRoutes.includes('"شي ثاني"'));
check("Active booking overrides order fulfillment", saraRoutes.includes("ACTIVE BOOKING OVERRIDES SERVICE SELECTION"));
check("Draft preorder tool remains", saraRoutes.includes("update_booking_preorder"));
check("Booking memory keeps twelve turns", saraRoutes.includes("history.slice(-12).map"));
check("Booking parser preserves Arabic party size", customerJs.includes("'ثلاث':3"));
check("Booking confirmation repeats phone and time", customerJs.includes("رقم الجوال ${phone}، الحجز ${date} الساعة ${time}"));
check("Booking idempotency remains", orderSource.includes("INTERVAL '10 minutes'"));
check("Voice capture has a 15-second watchdog", customerJs.includes("saraCaptureWatchdog") && customerJs.includes("15000"));
check("Voice capture MIME selector exists", customerJs.includes("function bestMime()") && customerJs.includes("audio/mp4") && customerJs.includes("audio/webm;codecs=opus"));
check("iPhone silence threshold clears idle noise", customerJs.includes("saraNoiseFloor*1.32+0.002") && customerJs.includes("endSilenceMs=1250"));
check("Recording status advances to transcription", customerJs.includes("status.textContent=TEXT[waiterLanguage].transcribing"));

check("Security headers enabled", appSource.includes("helmet("));
check("Rate limiting enabled", appSource.includes("rateLimit("));
check("Static assets revalidate", appSource.includes('Cache-Control", "no-cache, max-age=0, must-revalidate'));
check("Settings editor is not auto-refreshed", dashboardJs.includes("if(!['menu','settings'].includes(view))load()"));

const customerEndpoints = [...new Set([...customerJs.matchAll(/["'`]\/api\/([A-Za-z0-9_\-/]+)/g)].map((m) => m[1]))];
const dashboardEndpoints = [...new Set([...dashboardJs.matchAll(/["'`]\/api\/([A-Za-z0-9_\-/]+)/g)].map((m) => m[1]))];
const allEndpoints = [...customerEndpoints, ...dashboardEndpoints];
const covered = allEndpoints.filter((endpoint) => {
  const suffix = endpoint.split("/").filter(Boolean).pop();
  return routeSources.includes(`/${suffix}`);
});
check("Frontend API endpoints have route coverage", covered.length >= Math.max(1, allEndpoints.length - 3));

let failed = 0;
for (const result of checks) {
  console.log(`${result.ok ? "✓" : "✗"} ${result.name}`);
  if (!result.ok) failed += 1;
}
if (failed) {
  console.error(`\n${failed} smoke check(s) failed.`);
  process.exit(1);
}
console.log(`\n✓ ${checks.length} smoke checks passed.`);
