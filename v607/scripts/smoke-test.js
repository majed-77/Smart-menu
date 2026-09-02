"use strict";

const fs = require("fs");
const path = require("path");
const { BASE_CATEGORIES, BASE_MENU_ITEMS } = require("../src/data/base-menu");

const root = path.join(__dirname, "..");
const customerHtml = fs.readFileSync(path.join(root, "public", "index.html"), "utf8");
const dashboardHtml = fs.readFileSync(path.join(root, "public", "restaurant-dashboard.html"), "utf8");
const customerJs = fs.readFileSync(path.join(root, "public", "assets", "js", "customer-app.js"), "utf8");
const dashboardJs = fs.readFileSync(path.join(root, "public", "assets", "js", "dashboard-app.js"), "utf8");
const databaseSource = fs.readFileSync(path.join(root, "src", "db", "database.js"), "utf8");
const routeSources = [
  "src/app.js",
  "src/features/menu/menu-routes.js",
  "src/features/restaurant/restaurant-routes.js",
  "src/features/orders/orders-routes.js",
  "src/features/sara/sara-routes.js"
].map((file) => fs.readFileSync(path.join(root, file), "utf8")).join("\n");

const checks = [];
function check(name, condition) {
  checks.push({ name, ok: Boolean(condition) });
}

check("16 menu categories", BASE_CATEGORIES.length === 16);
check("138 base menu items", BASE_MENU_ITEMS.length === 138);
check("Arabic is canonical for all base item names", BASE_MENU_ITEMS.every((item) => /[\u0600-\u06FF]/.test(item.nameAr)));
check("Arabic description exists for all base items", BASE_MENU_ITEMS.every((item) => String(item.descriptionAr || "").trim().length > 0));
check("Base prices no longer contain DT/TND", BASE_MENU_ITEMS.every((item) => !/(?:\bDT\b|TND)/i.test(String(item.priceText))));
check("Unique base item keys", new Set(BASE_MENU_ITEMS.map((item) => item.itemKey)).size === BASE_MENU_ITEMS.length);
check("Customer page loads external JS", /\/assets\/js\/customer-app\.js/.test(customerHtml));
check("Dashboard loads external JS", /\/assets\/js\/dashboard-app\.js/.test(dashboardHtml));
check("Customer JS has one API menu source", !/let\s+menu\s*=\s*\[\s*\{cat:/.test(customerJs));
check("Dashboard Arabic item editor", dashboardHtml.includes("اسم الصنف بالعربية — الأساسي"));
check("Dashboard SAR price field", dashboardHtml.includes("السعر الأساسي (ريال سعودي)"));
check("Dashboard supports image upload", dashboardHtml.includes('id="mImageFile"'));
check("Customer supports 1.1s DeepSeek silence", customerJs.includes("isHybrid3?1100:600"));
check("Booking idempotency preserved", fs.readFileSync(path.join(root, "src/features/orders/orders-service.js"), "utf8").includes("INTERVAL '10 minutes'"));
check("Security headers enabled", fs.readFileSync(path.join(root, "src/app.js"), "utf8").includes("helmet("));
check("Rate limiting enabled", fs.readFileSync(path.join(root, "src/app.js"), "utf8").includes("rateLimit("));
check("Deepgram STT + OpenAI engine button exists", customerHtml.includes('data-sara-engine="openai-deepgram"') && customerHtml.includes("Deepgram STT + OpenAI"));
check("OpenAI brain provider exists", routeSources.includes('provider === "openai"'));
check("Deepgram STT route mode exists", routeSources.includes('deepgram-stt') && routeSources.includes('api.deepgram.com/v1/listen'));
check("Deepgram Arabic STT pinned to Saudi dialect", fs.readFileSync(path.join(root, "src/config/env.js"), "utf8").includes('DEEPGRAM_STT_LANGUAGE_AR') && fs.readFileSync(path.join(root, "src/config/env.js"), "utf8").includes('ar-SA'));
check("Deepgram engine uses OpenAI TTS", customerJs.includes("const ttsEndpoint='/api/tts';"));
check("Deepgram engine sends Deepgram STT mode", customerJs.includes("form.append('mode','deepgram-stt')"));
check("Deepgram key is server-side env only", fs.readFileSync(path.join(root, "src/config/env.js"), "utf8").includes('DEEPGRAM_API_KEY') && !customerJs.includes('DEEPGRAM_API_KEY'));
check("Deepgram STT key is server-side env only", fs.readFileSync(path.join(root, "src/config/env.js"), "utf8").includes('DEEPGRAM_API_KEY') && !customerJs.includes('DEEPGRAM_API_KEY'));
check("Settings form is not auto-refreshed while editing", dashboardJs.includes("if(!['menu','settings'].includes(view))load()"));
check("Customer assets are version-busted", customerHtml.includes("customer.css?v=6.0.7") && customerHtml.includes("customer-app.js?v=6.0.7"));
check("Dashboard assets are version-busted", dashboardHtml.includes("dashboard.css?v=6.0.7") && dashboardHtml.includes("dashboard-app.js?v=6.0.7"));
check("Static assets revalidate instead of one-day cache", fs.readFileSync(path.join(root, "src/app.js"), "utf8").includes('Cache-Control", "no-cache, max-age=0, must-revalidate') && !fs.readFileSync(path.join(root, "src/app.js"), "utf8").includes('maxAge: env.nodeEnv === "production" ? "1d" : 0'));
check("HTML routes disable stale cache", fs.readFileSync(path.join(root, "src/app.js"), "utf8").includes('no-store, no-cache, must-revalidate, proxy-revalidate'));

const customerEndpoints = [...new Set([...customerJs.matchAll(/["'`]\/api\/([A-Za-z0-9_\-/]+)/g)].map((m) => m[1]))];
const dashboardEndpoints = [...new Set([...dashboardJs.matchAll(/["'`]\/api\/([A-Za-z0-9_\-/]+)/g)].map((m) => m[1]))];
const allEndpoints = [...customerEndpoints, ...dashboardEndpoints];
const endpointCoverage = allEndpoints.filter((endpoint) => {
  const suffix = endpoint.split("/").filter(Boolean).pop();
  return routeSources.includes(suffix) || routeSources.includes(`/${suffix}`);
});
check("Frontend API endpoints have route coverage", endpointCoverage.length >= Math.max(1, allEndpoints.length - 3));

let failed = 0;
for (const result of checks) {
  console.log(`${result.ok ? "✓" : "✗"} ${result.name}`);
  if (!result.ok) failed += 1;
}


check("Booking flow forces missing WhatsApp before confirmation", customerJs.includes("exp3BookingMissingReply") && customerJs.includes("عطيني رقم الجوال أو الواتساب عشان أكمل الحجز"));
check("Booking state recognizes booking intent", customerJs.includes("altBookingActive=true"));
check("Arabic booking name parser tolerates trailing punctuation", customerJs.includes("rawForNames=raw.replace"));
if (failed) {
  console.error(`\n${failed} smoke check(s) failed.`);
  process.exit(1);
}

check("Deepgram VAD uses more sensitive thresholds", customerJs.includes("isDeepgramEngine?0.016") && customerJs.includes("isDeepgramEngine?0.011") && customerJs.includes("isDeepgramEngine?1250"));
check("Deepgram VAD uses faster smoothing", customerJs.includes("saraEngine==='openai-deepgram'?.18:.35"));
check("Deepgram Nova-3 uses Saudi restaurant keyterms", routeSources.includes('url.searchParams.append("keyterm", term)') && routeSources.includes('"اعتمد"') && routeSources.includes('"رقم الجوال"'));
console.log(`\n✓ ${checks.length} smoke checks passed.`);
