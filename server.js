const express = require("express");
const path = require("path");
const crypto = require("crypto");
const OpenAI = require("openai");
const multer = require("multer");
const { Pool } = require("pg");
const { DateTime } = require("luxon");

const app = express();
const PORT = process.env.PORT || 3000;
const apiKey = process.env.OPENAI_API_KEY || "";
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || "";
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";
const ANTHROPIC_WORKSPACE_ID = process.env.ANTHROPIC_WORKSPACE_ID || "";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const KIMI_API_KEY = process.env.KIMI_API_KEY || process.env.MOONSHOT_API_KEY || "";
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || "";
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || "deepseek-v4-flash";
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.6-flash";
const KIMI_MODEL = process.env.KIMI_MODEL || "kimi-k2.5";
const ELEVENLABS_STT_MODEL = process.env.ELEVENLABS_STT_MODEL || "scribe_v2";
const FISH_AUDIO_API_KEY = process.env.FISH_AUDIO_API_KEY || "";
const FISH_AUDIO_VOICE_ID = process.env.FISH_AUDIO_VOICE_ID || "384051d27069462aa9b7a021ce541c8f";
const FISH_AUDIO_MODEL = process.env.FISH_AUDIO_MODEL || "s2.1-pro-free";
const DATABASE_URL = process.env.DATABASE_URL || "";
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || "";
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || "";
const TWILIO_WHATSAPP_FROM = process.env.TWILIO_WHATSAPP_FROM || "";
const TWILIO_MESSAGING_SERVICE_SID = process.env.TWILIO_MESSAGING_SERVICE_SID || "";
const TWILIO_CONTENT_SID = process.env.TWILIO_CONTENT_SID || "";
const TWILIO_TRIAL_CONTENT_SID = process.env.TWILIO_TRIAL_CONTENT_SID || "HXfe5ab5f00277942d4d4200328b4d403c";
const RESTAURANT_WHATSAPP_TO = process.env.RESTAURANT_WHATSAPP_TO || "";
const CRON_SECRET = process.env.CRON_SECRET || "";
const RESTAURANT_TIMEZONE = process.env.RESTAURANT_TIMEZONE || "Asia/Riyadh";
const RESTAURANT_DASHBOARD_PASSWORD = process.env.RESTAURANT_DASHBOARD_PASSWORD || "";
const RESTAURANT_DASHBOARD_SECRET = process.env.RESTAURANT_DASHBOARD_SECRET || RESTAURANT_DASHBOARD_PASSWORD || crypto.randomBytes(32).toString("hex");

const db = DATABASE_URL
  ? new Pool({
      connectionString: DATABASE_URL,
      ssl: /localhost|127\.0\.0\.1/.test(DATABASE_URL)
        ? false
        : { rejectUnauthorized: false }
    })
  : null;

const openai = new OpenAI({ apiKey });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }
});

app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "smart-menu-ai-multilingual.html"));
});

function normalizeOpenAIError(error) {
  const status = Number(error?.status || 500);
  const rawMessage =
    error?.error?.message ||
    error?.message ||
    "OpenAI request failed.";

  let code =
    error?.code ||
    error?.type ||
    error?.error?.code ||
    "OPENAI_ERROR";

  if (status === 401) code = "invalid_api_key";
  if (status === 403 && code === "OPENAI_ERROR") code = "permission_denied";
  if (status === 429 && /quota|billing|credit/i.test(rawMessage)) {
    code = "insufficient_quota";
  }

  return { status, code, message: rawMessage };
}


// ======================================================
// TABLE RESERVATIONS + WHATSAPP REMINDERS
// Reservations are stored in PostgreSQL. Reminder is sent 30 minutes before.
// ======================================================
async function initReservationDatabase() {
  if (!db) {
    console.warn("⚠️ DATABASE_URL is not configured; table reservations are disabled.");
    return;
  }
  await db.query(`
    CREATE TABLE IF NOT EXISTS reservations (
      id BIGSERIAL PRIMARY KEY,
      confirmation_code TEXT UNIQUE NOT NULL,
      customer_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      party_size INTEGER NOT NULL CHECK (party_size BETWEEN 1 AND 30),
      reservation_at TIMESTAMPTZ NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      order_items JSONB NOT NULL DEFAULT '[]'::jsonb,
      order_total_sar NUMERIC(12,2) NOT NULL DEFAULT 0,
      source TEXT NOT NULL DEFAULT 'form',
      language TEXT NOT NULL DEFAULT 'ar',
      status TEXT NOT NULL DEFAULT 'new',
      reminder_sent_at TIMESTAMPTZ,
      reminder_message_sid TEXT,
      reminder_attempts INTEGER NOT NULL DEFAULT 0,
      reminder_last_error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE reservations ADD COLUMN IF NOT EXISTS order_items JSONB NOT NULL DEFAULT '[]'::jsonb;
    ALTER TABLE reservations ADD COLUMN IF NOT EXISTS order_total_sar NUMERIC(12,2) NOT NULL DEFAULT 0;
    ALTER TABLE reservations ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'form';
    ALTER TABLE reservations ADD COLUMN IF NOT EXISTS staff_notes TEXT NOT NULL DEFAULT '';
    ALTER TABLE reservations ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

    CREATE TABLE IF NOT EXISTS table_orders (
      id BIGSERIAL PRIMARY KEY,
      order_code TEXT UNIQUE NOT NULL,
      table_number TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      staff_notes TEXT NOT NULL DEFAULT '',
      order_items JSONB NOT NULL DEFAULT '[]'::jsonb,
      order_total_sar NUMERIC(12,2) NOT NULL DEFAULT 0,
      language TEXT NOT NULL DEFAULT 'ar',
      source TEXT NOT NULL DEFAULT 'sara_voice',
      status TEXT NOT NULL DEFAULT 'new',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE table_orders ADD COLUMN IF NOT EXISTS staff_notes TEXT NOT NULL DEFAULT '';
    ALTER TABLE table_orders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
    ALTER TABLE table_orders ADD COLUMN IF NOT EXISTS customer_name TEXT NOT NULL DEFAULT '';
    ALTER TABLE table_orders ADD COLUMN IF NOT EXISTS phone TEXT NOT NULL DEFAULT '';
    ALTER TABLE table_orders ADD COLUMN IF NOT EXISTS order_mode TEXT NOT NULL DEFAULT 'table';
    CREATE SEQUENCE IF NOT EXISTS table_order_number_seq START WITH 1 INCREMENT BY 1 MINVALUE 1;
    CREATE INDEX IF NOT EXISTS table_orders_active_idx ON table_orders (status, created_at DESC);

    CREATE SEQUENCE IF NOT EXISTS reservation_number_seq START WITH 1 INCREMENT BY 1 MINVALUE 1;
    CREATE INDEX IF NOT EXISTS reservations_reminder_due_idx
      ON reservations (reservation_at)
      WHERE reminder_sent_at IS NULL AND status IN ('new','confirmed');
  `);

  // Keep the numeric sequence aligned with any existing numeric booking codes.
  // This avoids duplicate-key failures after deployments or migrations.
  const maxNumeric = await db.query(`
    SELECT COALESCE(MAX(confirmation_code::bigint), 0) AS max_code
    FROM reservations
    WHERE confirmation_code ~ '^[0-9]+$'
  `);
  const maxCode = Number(maxNumeric.rows[0]?.max_code || 0);
  if (maxCode > 0) {
    await db.query("SELECT setval('reservation_number_seq', $1, true)", [maxCode]);
  } else {
    await db.query("SELECT setval('reservation_number_seq', 1, false)");
  }

  console.log("✅ Reservations database ready");
}

async function nextReservationNumber(client = db) {
  const result = await client.query("SELECT nextval('reservation_number_seq')::text AS code");
  return result.rows[0].code;
}

function normalizeWhatsAppPhone(value) {
  const latinDigits = String(value || "")
    .replace(/[٠-٩]/g, d => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[۰-۹]/g, d => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)));

  let phone = latinDigits.trim()
    .replace(/[\s().-]/g, "")
    .replace(/[^+\d]/g, "");

  if (phone.startsWith("00")) phone = "+" + phone.slice(2);

  // Common local formats: Saudi mobile 05xxxxxxxx -> +9665xxxxxxxx
  if (/^05\d{8}$/.test(phone)) phone = "+966" + phone.slice(1);

  // Café Victor Hugo is in Tunisia: local 8-digit mobile/phone -> +216xxxxxxxx
  if (/^\d{8}$/.test(phone)) phone = "+216" + phone;

  // Accept 9665... / 216... if the guest omitted the plus sign.
  if (/^9665\d{8}$/.test(phone)) phone = "+" + phone;
  if (/^216\d{8}$/.test(phone)) phone = "+" + phone;

  if (!/^\+[1-9]\d{7,14}$/.test(phone)) return "";
  return phone;
}

function reminderCopy(reservation) {
  const local = DateTime.fromJSDate(new Date(reservation.reservation_at), { zone: "utc" })
    .setZone(RESTAURANT_TIMEZONE);
  const dateAr = local.setLocale("ar").toFormat("cccc d LLLL");
  const timeAr = local.setLocale("ar").toFormat("h:mm a");
  const dateFr = local.setLocale("fr").toFormat("cccc d LLLL");
  const time24 = local.toFormat("HH:mm");
  const name = reservation.customer_name;
  const party = reservation.party_size;

  if (reservation.language === "fr") {
    return `Bonjour ${name} 👋 Rappel de votre réservation chez Café Victor Hugo aujourd’hui (${dateFr}) à ${time24}, pour ${party} personne${party > 1 ? "s" : ""}. À très bientôt 🌷`;
  }
  if (reservation.language === "en") {
    return `Hi ${name} 👋 This is a reminder for your reservation at Café Victor Hugo today at ${time24} for ${party} guest${party > 1 ? "s" : ""}. See you soon 🌷`;
  }
  return `هلا ${name} 👋 تذكير بحجزك في Café Victor Hugo ${dateAr} الساعة ${timeAr}، لعدد ${party} ${party === 1 ? "شخص" : "أشخاص"}. ننتظرك 🌷`;
}

function twilioWhatsAppFrom() {
  if (!TWILIO_WHATSAPP_FROM) return "";
  return TWILIO_WHATSAPP_FROM.startsWith("whatsapp:")
    ? TWILIO_WHATSAPP_FROM
    : `whatsapp:${TWILIO_WHATSAPP_FROM}`;
}

function restaurantOrderCopy(reservation) {
  const local = DateTime.fromJSDate(new Date(reservation.reservation_at), { zone: "utc" })
    .setZone(RESTAURANT_TIMEZONE);
  const items = Array.isArray(reservation.order_items) ? reservation.order_items : [];
  const lines = items.length
    ? items.map((item, index) => {
        const qty = Math.max(1, Number(item?.quantity) || 1);
        const name = String(item?.name || "صنف").trim();
        const request = String(item?.specialRequest || "").trim();
        const price = Number(item?.unitPriceSar);
        const pricePart = Number.isFinite(price) ? ` — ${Math.round(price * qty * 100) / 100} ر.س` : "";
        return `${index + 1}) ${qty} × ${name}${pricePart}${request ? `\n   ملاحظة: ${request}` : ""}`;
      }).join("\n")
    : "لا يوجد طلب مسبق";

  const total = Number(reservation.order_total_sar || 0);
  const notes = String(reservation.notes || "").trim();
  return [
    `🔔 حجز/طلب جديد — رقم ${reservation.confirmation_code}`,
    `الاسم: ${reservation.customer_name}`,
    `الجوال: ${reservation.phone}`,
    `التاريخ: ${local.toFormat("dd/LL/yyyy")}`,
    `الوقت: ${local.toFormat("HH:mm")}`,
    `عدد الأشخاص: ${reservation.party_size}`,
    "",
    "الطلب:",
    lines,
    ...(items.length ? [`الإجمالي: ${Math.round(total * 100) / 100} ر.س`] : []),
    ...(notes ? ["", `ملاحظات الحجز: ${notes}`] : []),
    "",
    `المصدر: ${reservation.source === "sara_voice" ? "سارة" : "نموذج الموقع"}`
  ].join("\n");
}

async function sendTwilioWhatsApp({ to, body, forceFrom = false }) {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
    throw new Error("Twilio WhatsApp credentials are not configured.");
  }
  if (!TWILIO_MESSAGING_SERVICE_SID && !TWILIO_WHATSAPP_FROM) {
    throw new Error("Set TWILIO_MESSAGING_SERVICE_SID or TWILIO_WHATSAPP_FROM.");
  }

  const normalizedTo = normalizeWhatsAppPhone(String(to || "").replace(/^whatsapp:/i, ""));
  if (!normalizedTo) throw new Error("Invalid WhatsApp destination number.");

  const params = new URLSearchParams();
  params.set("To", `whatsapp:${normalizedTo}`);
  // Restaurant order copies must use the actual WhatsApp Sandbox sender directly.
  // Using a Messaging Service in Trial/Sandbox can trigger ContentSid/template requirements.
  if (!forceFrom && TWILIO_MESSAGING_SERVICE_SID) {
    params.set("MessagingServiceSid", TWILIO_MESSAGING_SERVICE_SID);
  } else {
    params.set("From", twilioWhatsAppFrom());
  }
  params.set("Body", String(body || "").slice(0, 1500));

  const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(TWILIO_ACCOUNT_SID)}/Messages.json`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: params
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.message || `Twilio HTTP ${response.status}`);
  return payload.sid || "sent";
}

async function sendRestaurantWhatsApp(reservation) {
  if (!RESTAURANT_WHATSAPP_TO) {
    throw new Error("RESTAURANT_WHATSAPP_TO is not configured.");
  }
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_WHATSAPP_FROM) {
    throw new Error("Twilio WhatsApp credentials are not configured.");
  }

  // Twilio's current Console Trial only allows outbound WhatsApp messages
  // using a Twilio-provided ContentSid. It rejects a free-form Body with
  // "ContentSid Required" even when the recipient has joined Try out WhatsApp.
  // The template below is the working Twilio-provided trial template captured
  // from this project's Try out WhatsApp flow. Override it in Render with
  // TWILIO_TRIAL_CONTENT_SID if Twilio rotates the trial template.
  if (TWILIO_TRIAL_CONTENT_SID) {
    const normalizedTo = normalizeWhatsAppPhone(String(RESTAURANT_WHATSAPP_TO).replace(/^whatsapp:/i, ""));
    if (!normalizedTo) throw new Error("Invalid restaurant WhatsApp destination number.");

    const params = new URLSearchParams();
    params.set("To", `whatsapp:${normalizedTo}`);
    params.set("From", twilioWhatsAppFrom());
    params.set("ContentSid", TWILIO_TRIAL_CONTENT_SID);

    const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(TWILIO_ACCOUNT_SID)}/Messages.json`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: "Basic " + Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: params
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.message || `Twilio HTTP ${response.status}`);
    return payload.sid || "sent";
  }

  // Upgraded Twilio accounts can send the full restaurant order body here.
  return sendTwilioWhatsApp({
    to: RESTAURANT_WHATSAPP_TO,
    body: restaurantOrderCopy(reservation),
    forceFrom: true
  });
}

async function sendWhatsAppReminder(reservation) {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
    throw new Error("Twilio WhatsApp credentials are not configured.");
  }
  if (!TWILIO_MESSAGING_SERVICE_SID && !TWILIO_WHATSAPP_FROM) {
    throw new Error("Set TWILIO_MESSAGING_SERVICE_SID or TWILIO_WHATSAPP_FROM.");
  }

  const params = new URLSearchParams();
  params.set("To", `whatsapp:${reservation.phone}`);

  if (TWILIO_MESSAGING_SERVICE_SID) {
    params.set("MessagingServiceSid", TWILIO_MESSAGING_SERVICE_SID);
  } else {
    params.set("From", twilioWhatsAppFrom());
  }

  // For production business-initiated WhatsApp reminders, configure an approved
  // Twilio Content Template and put its SID in TWILIO_CONTENT_SID.
  if (TWILIO_CONTENT_SID) {
    const local = DateTime.fromJSDate(new Date(reservation.reservation_at), { zone: "utc" })
      .setZone(RESTAURANT_TIMEZONE);
    params.set("ContentSid", TWILIO_CONTENT_SID);
    params.set("ContentVariables", JSON.stringify({
      "1": reservation.customer_name,
      "2": local.toFormat("dd/LL/yyyy"),
      "3": local.toFormat("HH:mm"),
      "4": String(reservation.party_size)
    }));
  } else {
    params.set("Body", reminderCopy(reservation));
  }

  const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(TWILIO_ACCOUNT_SID)}/Messages.json`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: params
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.message || `Twilio HTTP ${response.status}`);
  }
  return payload.sid || "sent";
}

async function processDueReservationReminders() {
  if (!db) return { checked: 0, sent: 0, failed: 0 };

  // FOR UPDATE SKIP LOCKED avoids duplicate sends if two workers overlap.
  const client = await db.connect();
  let rows = [];
  try {
    await client.query("BEGIN");
    const result = await client.query(`
      SELECT * FROM reservations
      WHERE status = 'confirmed'
        AND reminder_sent_at IS NULL
        AND reservation_at > NOW()
        AND reservation_at <= NOW() + INTERVAL '30 minutes'
        AND reminder_attempts < 8
      ORDER BY reservation_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 25
    `);
    rows = result.rows;
    // Mark attempt inside the lock before network calls.
    for (const row of rows) {
      await client.query(
        "UPDATE reservations SET reminder_attempts = reminder_attempts + 1 WHERE id = $1",
        [row.id]
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }

  let sent = 0, failed = 0;
  for (const row of rows) {
    try {
      const sid = await sendWhatsAppReminder(row);
      await db.query(
        `UPDATE reservations
         SET reminder_sent_at = NOW(), reminder_message_sid = $2, reminder_last_error = NULL
         WHERE id = $1 AND reminder_sent_at IS NULL`,
        [row.id, sid]
      );
      sent++;
    } catch (error) {
      failed++;
      console.error("WhatsApp reminder failed:", row.confirmation_code, error.message);
      await db.query(
        "UPDATE reservations SET reminder_last_error = $2 WHERE id = $1",
        [row.id, String(error.message || error).slice(0, 1000)]
      );
    }
  }
  return { checked: rows.length, sent, failed };
}

let reservationSchemaReady = false;
let reservationSchemaError = "";

async function ensureReservationDatabaseReady() {
  if (!db) return false;
  if (reservationSchemaReady) return true;
  try {
    await initReservationDatabase();
    reservationSchemaReady = true;
    reservationSchemaError = "";
    return true;
  } catch (error) {
    reservationSchemaReady = false;
    reservationSchemaError = String(error?.message || error).slice(0, 500);
    console.error("Reservation DB readiness failed:", error);
    return false;
  }
}



// ======================================================
// RESTAURANT DASHBOARD
// ======================================================
function parseCookies(req) {
  const out = {};
  String(req.headers.cookie || "").split(";").forEach(part => {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  });
  return out;
}
function dashboardToken() {
  const day = DateTime.now().setZone(RESTAURANT_TIMEZONE).toFormat("yyyy-LL-dd");
  return crypto.createHmac("sha256", RESTAURANT_DASHBOARD_SECRET).update(`restaurant-dashboard:${day}`).digest("hex");
}
function safeEqual(a,b){
  const aa=Buffer.from(String(a||"")), bb=Buffer.from(String(b||""));
  return aa.length===bb.length && crypto.timingSafeEqual(aa,bb);
}
function requireRestaurantDashboard(req,res,next){
  if (!RESTAURANT_DASHBOARD_PASSWORD) return res.status(503).json({ok:false,message:"أضف RESTAURANT_DASHBOARD_PASSWORD في Render أولًا."});
  if (!safeEqual(parseCookies(req).restaurant_dashboard, dashboardToken())) return res.status(401).json({ok:false,message:"يرجى تسجيل الدخول."});
  next();
}
app.get(["/restaurant", "/restaurant/", "/restaurant-dashboard", "/restaurant-dashboard/"], (req,res)=>res.sendFile(path.join(__dirname,"restaurant-dashboard.html")));
app.post("/api/restaurant/login", (req,res)=>{
  if (!RESTAURANT_DASHBOARD_PASSWORD) return res.status(503).json({ok:false,message:"أضف RESTAURANT_DASHBOARD_PASSWORD في Render أولًا."});
  if (!safeEqual(req.body?.password, RESTAURANT_DASHBOARD_PASSWORD)) return res.status(401).json({ok:false,message:"كلمة المرور غير صحيحة."});
  res.setHeader("Set-Cookie",`restaurant_dashboard=${dashboardToken()}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=86400`);
  res.json({ok:true});
});
app.post("/api/restaurant/logout", (req,res)=>{res.setHeader("Set-Cookie","restaurant_dashboard=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0");res.json({ok:true})});
app.get("/api/restaurant/reservations", requireRestaurantDashboard, async (req,res)=>{
  try{
    if(!db || !(await ensureReservationDatabaseReady())) return res.status(503).json({ok:false,message:"قاعدة الحجوزات غير جاهزة."});
    const now=DateTime.now().setZone(RESTAURANT_TIMEZONE), start=now.startOf("day"), end=now.endOf("day");
    const result=await db.query(`SELECT id, confirmation_code, customer_name, phone, party_size, reservation_at, notes, staff_notes, order_items, order_total_sar, source, language, status, created_at, updated_at FROM reservations ORDER BY reservation_at ASC`);
    const rows=result.rows.map(r=>{
      const local=DateTime.fromJSDate(new Date(r.reservation_at),{zone:"utc"}).setZone(RESTAURANT_TIMEZONE);
      // Daily dashboard logic (restaurant local time):
      // past reservations always leave the live "today" screen at midnight,
      // future reservations stay saved under "upcoming", and only the current
      // local calendar day contributes to today's counters.
      let bucket="archive";
      if(local>=start && local<=end && !["completed","cancelled"].includes(r.status)) bucket="today";
      else if(local>end && !["completed","cancelled"].includes(r.status)) bucket="upcoming";
      const isLate=local>=start && local<now && !["completed","cancelled"].includes(r.status);
      return {...r,bucket,is_late:isLate};
    });
    res.json({ok:true,timezone:RESTAURANT_TIMEZONE,reservations:rows});
  }catch(e){console.error("Dashboard reservations error",e);res.status(500).json({ok:false,message:"تعذر تحميل الحجوزات."})}
});
app.patch("/api/restaurant/reservations/:id/status", requireRestaurantDashboard, async(req,res)=>{
  try{const allowed=["new","confirmed","arrived","completed","cancelled"];const status=String(req.body?.status||"");if(!allowed.includes(status))return res.status(400).json({ok:false,message:"حالة غير صحيحة."});const q=await db.query("UPDATE reservations SET status=$1, updated_at=NOW() WHERE id=$2 RETURNING id,status",[status,req.params.id]);if(!q.rowCount)return res.status(404).json({ok:false,message:"الحجز غير موجود."});res.json({ok:true,reservation:q.rows[0]})}catch(e){res.status(500).json({ok:false,message:"تعذر تحديث الحالة."})}
});
app.patch("/api/restaurant/reservations/:id/notes", requireRestaurantDashboard, async(req,res)=>{
  try{const staffNotes=String(req.body?.staffNotes||"").trim().slice(0,1000);const q=await db.query("UPDATE reservations SET staff_notes=$1, updated_at=NOW() WHERE id=$2 RETURNING id,staff_notes",[staffNotes,req.params.id]);if(!q.rowCount)return res.status(404).json({ok:false,message:"الحجز غير موجود."});res.json({ok:true,reservation:q.rows[0]})}catch(e){res.status(500).json({ok:false,message:"تعذر حفظ الملاحظة."})}
});


app.get("/api/restaurant/table-orders", requireRestaurantDashboard, async (req,res)=>{
  try{
    if(!db || !(await ensureReservationDatabaseReady())) return res.status(503).json({ok:false,message:"قاعدة الطلبات غير جاهزة."});
    const now=DateTime.now().setZone(RESTAURANT_TIMEZONE), start=now.startOf("day"), end=now.endOf("day");
    const result=await db.query(`SELECT id, order_code, table_number, customer_name, phone, order_mode, notes, staff_notes, order_items, order_total_sar, language, source, status, created_at, updated_at FROM table_orders ORDER BY created_at DESC LIMIT 500`);
    const rows=result.rows.map(r=>{
      const local=DateTime.fromJSDate(new Date(r.created_at),{zone:"utc"}).setZone(RESTAURANT_TIMEZONE);
      const bucket=(local>=start && local<=end)?"today":"archive";
      return {...r,bucket};
    });
    res.json({ok:true,timezone:RESTAURANT_TIMEZONE,day:start.toISODate(),orders:rows});
  }catch(e){console.error("Dashboard table orders error",e);res.status(500).json({ok:false,message:"تعذر تحميل طلبات الطاولات."})}
});
app.patch("/api/restaurant/table-orders/:id/status", requireRestaurantDashboard, async(req,res)=>{
  try{const allowed=["new","preparing","ready","served","cancelled"];const status=String(req.body?.status||"");if(!allowed.includes(status))return res.status(400).json({ok:false,message:"حالة غير صحيحة."});const q=await db.query("UPDATE table_orders SET status=$1, updated_at=NOW() WHERE id=$2 RETURNING id,status",[status,req.params.id]);if(!q.rowCount)return res.status(404).json({ok:false,message:"الطلب غير موجود."});res.json({ok:true,order:q.rows[0]})}catch(e){res.status(500).json({ok:false,message:"تعذر تحديث حالة الطلب."})}
});
app.patch("/api/restaurant/table-orders/:id/notes", requireRestaurantDashboard, async(req,res)=>{
  try{const staffNotes=String(req.body?.staffNotes||"").trim().slice(0,1000);const q=await db.query("UPDATE table_orders SET staff_notes=$1, updated_at=NOW() WHERE id=$2 RETURNING id,staff_notes",[staffNotes,req.params.id]);if(!q.rowCount)return res.status(404).json({ok:false,message:"الطلب غير موجود."});res.json({ok:true,order:q.rows[0]})}catch(e){res.status(500).json({ok:false,message:"تعذر حفظ الملاحظة."})}
});
app.post("/api/table-orders", async(req,res)=>{
  try{
    if(!db || !(await ensureReservationDatabaseReady())) return res.status(503).json({ok:false,message:"قاعدة الطلبات غير جاهزة."});
    const {tableNumber, customerName="", phone="", notes="", language="ar", orderItems=[]}=req.body||{};
    const rawTable=String(tableNumber||"").trim().replace(/[^0-9A-Za-zأ-ي_-]/g,"").slice(0,20);
    const isExternal=!rawTable;
    const table=isExternal?"OUTSIDE":rawTable;
    const cleanName=String(customerName||"").trim().slice(0,120);
    const cleanPhone=normalizeWhatsAppPhone(phone)||String(phone||"").trim().slice(0,40);
    if(isExternal && !cleanName) return res.status(400).json({ok:false,code:"MISSING_CUSTOMER_NAME",message:"اكتب اسم العميل للطلب الخارجي."});
    if(isExternal && !cleanPhone) return res.status(400).json({ok:false,code:"MISSING_PHONE",message:"اكتب رقم جوال العميل للطلب الخارجي."});
    const items=Array.isArray(orderItems)?orderItems.slice(0,50).map(item=>{
      const name=String(item?.name||"").trim().slice(0,160);
      const quantity=Math.max(1,Math.min(20,Math.trunc(Number(item?.quantity)||1)));
      const specialRequest=String(item?.specialRequest||"").trim().slice(0,300);
      const unitPriceSar=Number(item?.unitPriceSar);
      return {name,quantity,specialRequest,unitPriceSar:Number.isFinite(unitPriceSar)&&unitPriceSar>=0?Math.round(unitPriceSar*100)/100:null};
    }).filter(x=>x.name):[];
    if(!items.length) return res.status(400).json({ok:false,code:"EMPTY_ORDER",message:"الطلب لا يحتوي على أصناف."});
    const total=Math.round(items.reduce((sum,x)=>sum+(Number.isFinite(x.unitPriceSar)?x.unitPriceSar*x.quantity:0),0)*100)/100;
    const code=(await db.query("SELECT nextval('table_order_number_seq')::text AS code")).rows[0].code;
    const lang=["ar","fr","en"].includes(language)?language:"ar";
    const q=await db.query(`INSERT INTO table_orders (order_code,table_number,customer_name,phone,order_mode,notes,order_items,order_total_sar,language,source) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10) RETURNING *`,[code,table,cleanName,cleanPhone,isExternal?'external':'table',String(notes||"").trim().slice(0,500),JSON.stringify(items),total,lang,isExternal?'sara_external':'sara_voice']);
    const row=q.rows[0];
    return res.status(201).json({ok:true,order:{id:row.id,code:row.order_code,tableNumber:isExternal?'':row.table_number,orderMode:isExternal?'external':'table',customerName:row.customer_name,phone:row.phone,notes:row.notes,orderItems:row.order_items,totalSar:Number(row.order_total_sar||0),status:row.status,createdAt:row.created_at}});
  }catch(e){console.error("Table order save error",e);return res.status(500).json({ok:false,message:"تعذر حفظ طلب الطاولة."})}
});

app.post("/api/reservations", async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({
        ok: false,
        code: "DATABASE_NOT_CONFIGURED",
        message: "نظام الحجز يحتاج DATABASE_URL في Render."
      });
    }
    if (!(await ensureReservationDatabaseReady())) {
      return res.status(503).json({
        ok: false,
        code: "DATABASE_NOT_READY",
        message: "قاعدة الحجوزات غير جاهزة الآن. حاول مرة ثانية بعد ثوانٍ.",
        detail: reservationSchemaError
      });
    }

    const { name, phone, partySize, date, time, notes = "", language = "ar", orderItems = [], source = "form" } = req.body || {};
    const customerName = String(name || "").trim().slice(0, 100);
    const normalizedPhone = normalizeWhatsAppPhone(phone);
    const party = Number(partySize);
    const lang = ["ar", "fr", "en"].includes(language) ? language : "ar";

    const cleanOrderItems = Array.isArray(orderItems)
      ? orderItems.slice(0, 50).map((item) => {
          const name = String(item?.name || "").trim().slice(0, 160);
          const quantity = Math.max(1, Math.min(20, Math.trunc(Number(item?.quantity) || 1)));
          const specialRequest = String(item?.specialRequest || "").trim().slice(0, 300);
          const unitPriceSar = Number(item?.unitPriceSar);
          return {
            name,
            quantity,
            specialRequest,
            unitPriceSar: Number.isFinite(unitPriceSar) && unitPriceSar >= 0 ? Math.round(unitPriceSar * 100) / 100 : null
          };
        }).filter((item) => item.name)
      : [];
    const orderTotalSar = Math.round(cleanOrderItems.reduce((sum, item) =>
      sum + (Number.isFinite(item.unitPriceSar) ? item.unitPriceSar * item.quantity : 0), 0) * 100) / 100;
    const reservationSource = source === "sara_voice" ? "sara_voice" : "form";

    if (customerName.length < 2) {
      return res.status(400).json({ ok: false, code: "INVALID_NAME", message: "اكتب اسم الحجز." });
    }
    if (!normalizedPhone) {
      return res.status(400).json({ ok: false, code: "INVALID_PHONE", message: "رقم الواتساب غير واضح. قل الرقم كاملًا، ويمكنك قول رقم سعودي يبدأ 05 أو رقم دولي يبدأ +." });
    }
    if (!Number.isInteger(party) || party < 1 || party > 30) {
      return res.status(400).json({ ok: false, code: "INVALID_PARTY_SIZE", message: "عدد الأشخاص يجب أن يكون من 1 إلى 30." });
    }

    const localDateTime = DateTime.fromISO(`${date || ""}T${time || ""}`, { zone: RESTAURANT_TIMEZONE });
    if (!localDateTime.isValid) {
      return res.status(400).json({ ok: false, code: "INVALID_DATETIME", message: "اختر تاريخ ووقت الحجز بشكل صحيح." });
    }
    const now = DateTime.now().setZone(RESTAURANT_TIMEZONE);
    if (localDateTime <= now.plus({ minutes: 5 })) {
      return res.status(400).json({ ok: false, code: "PAST_DATETIME", message: "اختر موعدًا بعد الوقت الحالي بأكثر من 5 دقائق." });
    }
    if (localDateTime > now.plus({ years: 1 })) {
      return res.status(400).json({ ok: false, code: "TOO_FAR", message: "يمكن الحجز حتى سنة مقدمًا." });
    }

    const code = await nextReservationNumber();
    const inserted = await db.query(
      `INSERT INTO reservations
       (confirmation_code, customer_name, phone, party_size, reservation_at, notes, order_items, order_total_sar, source, language)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10)
       RETURNING id, confirmation_code, customer_name, phone, party_size, reservation_at, notes, order_items, order_total_sar, source, language, status, created_at`,
      [code, customerName, normalizedPhone, party, localDateTime.toUTC().toISO(), String(notes || "").trim().slice(0, 500), JSON.stringify(cleanOrderItems), orderTotalSar, reservationSource, lang]
    );

    const row = inserted.rows[0];
    const local = DateTime.fromJSDate(new Date(row.reservation_at), { zone: "utc" }).setZone(RESTAURANT_TIMEZONE);

    // The booking must remain confirmed even if WhatsApp is temporarily unavailable.
    // Send a copy of every newly confirmed booking/order to the restaurant when configured.
    let restaurantWhatsApp = { configured: Boolean(RESTAURANT_WHATSAPP_TO), sent: false };
    if (RESTAURANT_WHATSAPP_TO) {
      try {
        const sid = await sendRestaurantWhatsApp(row);
        restaurantWhatsApp = { configured: true, sent: true, sid };
        console.log(`✅ Restaurant WhatsApp sent for booking ${row.confirmation_code}`);
      } catch (notifyError) {
        restaurantWhatsApp = { configured: true, sent: false, error: String(notifyError?.message || notifyError).slice(0, 300) };
        console.error(`Restaurant WhatsApp failed for booking ${row.confirmation_code}:`, notifyError?.message || notifyError);
      }
    }

    return res.status(201).json({
      ok: true,
      restaurantWhatsApp,
      reservation: {
        code: row.confirmation_code,
        name: row.customer_name,
        phone: row.phone,
        partySize: row.party_size,
        date: local.toISODate(),
        time: local.toFormat("HH:mm"),
        timezone: RESTAURANT_TIMEZONE,
        reminderMinutesBefore: 30,
        orderItems: row.order_items || [],
        orderTotalSar: Number(row.order_total_sar || 0),
        source: row.source
      }
    });
  } catch (error) {
    console.error("Reservation create error:", {
      message: error?.message,
      code: error?.code,
      detail: error?.detail,
      constraint: error?.constraint
    });
    return res.status(500).json({
      ok: false,
      code: error?.code === "23505" ? "BOOKING_NUMBER_CONFLICT" : "RESERVATION_ERROR",
      message: error?.code === "23505"
        ? "صار تعارض مؤقت في رقم الحجز. حاول اعتماد الحجز مرة ثانية."
        : "تعذر حفظ الحجز الآن. حاول مرة أخرى."
    });
  }
});

app.get("/api/reservations-status", async (req, res) => {
  if (!db) return res.status(503).json({ ok: false, database: false, message: "DATABASE_URL غير مربوط." });
  try {
    const ready = await ensureReservationDatabaseReady();
    if (!ready) return res.status(503).json({ ok: false, database: true, schema: false, message: reservationSchemaError || "قاعدة الحجوزات غير جاهزة." });
    const result = await db.query("SELECT COUNT(*)::int AS count FROM reservations");
    return res.json({ ok: true, database: true, schema: true, reservations: result.rows[0].count });
  } catch (error) {
    console.error("Reservations status error:", error);
    return res.status(500).json({ ok: false, database: false, message: "تعذر الاتصال بقاعدة الحجوزات." });
  }
});

app.get("/api/reservations/:code", async (req, res) => {
  try {
    if (!db) return res.status(503).json({ ok: false, code: "DATABASE_NOT_CONFIGURED" });
    const result = await db.query(
      `SELECT confirmation_code, customer_name, party_size, reservation_at, notes, order_items, order_total_sar, source, status
       FROM reservations WHERE confirmation_code = $1 LIMIT 1`,
      [String(req.params.code || "").trim().toUpperCase()]
    );
    if (!result.rowCount) return res.status(404).json({ ok: false, code: "NOT_FOUND" });
    const row = result.rows[0];
    const local = DateTime.fromJSDate(new Date(row.reservation_at), { zone: "utc" }).setZone(RESTAURANT_TIMEZONE);
    return res.json({ ok: true, reservation: {
      code: row.confirmation_code,
      name: row.customer_name,
      partySize: row.party_size,
      date: local.toISODate(),
      time: local.toFormat("HH:mm"),
      notes: row.notes,
      orderItems: row.order_items || [],
      orderTotalSar: Number(row.order_total_sar || 0),
      source: row.source,
      status: row.status
    }});
  } catch (error) {
    return res.status(500).json({ ok: false, code: "RESERVATION_LOOKUP_ERROR" });
  }
});

app.post("/api/reminders/run", async (req, res) => {
  const supplied = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "") || String(req.headers["x-cron-secret"] || "");
  if (!CRON_SECRET || supplied !== CRON_SECRET) {
    return res.status(401).json({ ok: false, code: "UNAUTHORIZED" });
  }
  try {
    const result = await processDueReservationReminders();
    return res.json({ ok: true, ...result });
  } catch (error) {
    console.error("Reminder cron error:", error);
    return res.status(500).json({ ok: false, code: "REMINDER_RUN_ERROR", message: error.message });
  }
});

app.get("/api/diagnostics", async (req, res) => {
  if (!apiKey) {
    return res.status(401).json({
      ok: false,
      code: "invalid_api_key",
      message: "OPENAI_API_KEY غير موجود في Render."
    });
  }

  try {
    const response = await openai.responses.create({
      model: "gpt-4o-mini",
      input: "Reply with exactly: OK",
      max_output_tokens: 16
    });

    return res.json({
      ok: true,
      openai: true,
      model: "gpt-4o-mini",
      response: response.output_text || "OK"
    });
  } catch (error) {
    console.error("Diagnostics error:", error);
    const e = normalizeOpenAIError(error);
    return res.status(e.status).json({
      ok: false,
      code: e.code,
      message: e.message
    });
  }
});

// ======================================================
// AI WAITER
// IMPORTANT: this route matches the HTML payload exactly:
// { question, dish, menu, history, language }
// ======================================================

// ======================================================
// REALTIME VOICE — WebRTC proxy
// Browser sends SDP; API key stays on Render.
// ======================================================
app.post("/api/realtime-call", async (req, res) => {
  try {
    const { sdp, language = "ar", instructions = "" } = req.body || {};

    if (!apiKey) {
      return res.status(401).json({
        ok: false,
        code: "invalid_api_key",
        message: "مفتاح OpenAI غير موجود."
      });
    }

    if (!sdp) {
      return res.status(400).json({
        ok: false,
        code: "NO_SDP",
        message: "WebRTC SDP is required."
      });
    }

    const session = {
      type: "realtime",
      model: "gpt-realtime-1.5",
      instructions: String(instructions || "") + `\n\nوقت المطعم الحالي: ${DateTime.now().setZone(RESTAURANT_TIMEZONE).toFormat("yyyy-LL-dd HH:mm")} (${RESTAURANT_TIMEZONE}). استخدمي هذا الوقت لفهم كلمات مثل اليوم وبكرة وبعد بكرة.`,
      output_modalities: ["audio"],
      tools: [
        {
          type: "function",
          name: "confirm_booking_order",
          description: "Save a table reservation and optional food/drink pre-order only after the guest explicitly confirms the final summary.",
          parameters: {
            type: "object",
            additionalProperties: false,
            properties: {
              name: { type: "string", description: "Guest name" },
              phone: { type: "string", description: "WhatsApp phone in international format starting with +" },
              party_size: { type: "integer", minimum: 1, maximum: 30 },
              date: { type: "string", description: "Reservation date YYYY-MM-DD" },
              time: { type: "string", description: "Reservation time HH:MM 24-hour" },
              notes: { type: "string", description: "Reservation-level notes, empty string if none" },
              order_items: {
                type: "array",
                maxItems: 30,
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    item_name: { type: "string", description: "Menu item name exactly as shown in the current language" },
                    quantity: { type: "integer", minimum: 1, maximum: 20 },
                    special_request: { type: "string", description: "Any modification tied to THIS item only (e.g. بدون خس، بدون بصل، الصوص على جنب). Never put item modifications in general booking notes. Empty string if none." }
                  },
                  required: ["item_name", "quantity", "special_request"]
                }
              }
            },
            required: ["name", "phone", "party_size", "date", "time", "notes", "order_items"]
          }
        },
        {
          type: "function",
          name: "confirm_table_order",
          description: "Send a food/drink order to the restaurant after explicit confirmation. With a table QR it is a seated-table order; without a table QR it is an external pickup order and customer_name + phone are required.",
          parameters: {
            type: "object", additionalProperties: false,
            properties: {
              notes: { type: "string" },
              order_items: { type: "array", minItems: 1, items: { type: "object", additionalProperties: false, properties: { item_name:{type:"string"}, quantity:{type:"integer",minimum:1,maximum:20}, special_request:{type:"string"} }, required:["item_name","quantity","special_request"] } }
            },
            required:["notes","order_items"]
          }
        }
      ],
      tool_choice: "auto",
      // Audio responses consume many more tokens than plain text.
      // A low cap can stop Sara mid-sentence, so keep a generous budget.
      max_output_tokens: 1200,
      audio: {
        input: {
          turn_detection: {
            type: "server_vad",
            // Less sensitive to speaker echo / café background noise.
            // Real speech still interrupts Sara, but brief noise should not.
            threshold: 0.85,
            prefix_padding_ms: 420,
            silence_duration_ms: 950,
            create_response: false,
            interrupt_response: false
          },
          transcription: {
            model: "gpt-4o-mini-transcribe",
            language: ["ar", "fr", "en"].includes(language) ? language : undefined
          }
        },
        output: {
          voice: "coral"
        }
      }
    };

    // Call the official Realtime WebRTC endpoint directly.
    // This avoids depending on a particular OpenAI Node SDK version.
    // IMPORTANT: OpenAI expects these multipart parts as normal form fields
    // with explicit content types, not as file uploads with filenames.
    // Node's FormData + Blob adds filename=... and OpenAI may parse the
    // request as files instead of the required `sdp` field. Build multipart
    // explicitly so it matches the documented curl request exactly.
    const boundary = `----SmartMenuRealtime${Date.now().toString(16)}`;
    const multipartBody = Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="sdp"\r\n` +
      `Content-Type: application/sdp\r\n\r\n` +
      String(sdp) + `\r\n` +
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="session"\r\n` +
      `Content-Type: application/json\r\n\r\n` +
      JSON.stringify(session) + `\r\n` +
      `--${boundary}--\r\n`,
      "utf8"
    );

    const openaiResponse = await fetch(
      "https://api.openai.com/v1/realtime/calls",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
          "Content-Length": String(multipartBody.length)
        },
        body: multipartBody
      }
    );

    const answerText = await openaiResponse.text();

    if (!openaiResponse.ok) {
      let message = answerText || `OpenAI Realtime HTTP ${openaiResponse.status}`;
      let code = "REALTIME_API_ERROR";
      try {
        const parsed = JSON.parse(answerText);
        message = parsed?.error?.message || parsed?.message || message;
        code = parsed?.error?.code || parsed?.error?.type || code;
      } catch (_) {}

      console.error("Realtime API error:", openaiResponse.status, answerText);
      return res.status(openaiResponse.status).json({
        ok: false,
        code,
        message
      });
    }

    return res.json({
      ok: true,
      sdp: answerText
    });
  } catch (error) {
    console.error("Realtime call error:", error);
    return res.status(500).json({
      ok: false,
      code: "REALTIME_SERVER_ERROR",
      message: error?.message || "تعذر تشغيل المحادثة الصوتية."
    });
  }
});

app.post("/api/ai", async (req, res) => {
  try {
    const {
      question,
      message,
      dish = null,
      menu = [],
      history = [],
      language = "ar"
    } = req.body || {};

    // Support both "question" and older "message" clients.
    const userQuestion = String(question || message || "").trim();

    if (!apiKey) {
      return res.status(401).json({
        ok: false,
        code: "invalid_api_key",
        message: "مفتاح OpenAI غير موجود في Render."
      });
    }

    if (!userQuestion) {
      return res.status(400).json({
        ok: false,
        code: "EMPTY_MESSAGE",
        message:
          language === "fr"
            ? "Veuillez écrire ou dire votre question."
            : language === "en"
            ? "Please type or say your question."
            : "الرجاء كتابة أو قول سؤالك."
      });
    }

    const languageInstruction =
      language === "fr"
        ? "Réponds uniquement en français naturel, chaleureux et poli."
        : language === "en"
        ? "Reply only in natural, warm and polite English."
        : "أجب باللهجة السعودية البيضاء الطبيعية فقط، وتميل بشكل خفيف للهجة النجدية. استخدم تعبيرات سعودية يومية مفهومة مثل: هلا، أبشر، وش، وش ودك، تبي، ودك، تمام، من عيوني. تجنب اللهجات المصرية والشامية والتونسية، وتجنب الفصحى الرسمية إلا إذا احتجت توضيحًا دقيقًا. خل الجمل قصيرة وطبيعية كأنك نادلة سعودية فعلًا.";

    const instructions = `
Your name is Sara. You are the virtual AI waitress for Café Victor Hugo in La Marsa.

LANGUAGE:
${languageInstruction}

ROLE:
- Help guests understand the menu.
- Answer the customer's actual question directly.
- Recommend food and drinks when asked.
- Compare options using only the supplied menu data.
- Respect stated budget and preferences.

ACCURACY:
- Never invent prices, ingredients, allergens, availability, or preparation details.
- If allergy information is missing, advise the guest to confirm with restaurant staff.
- If a price is "—", say the price is not listed.
- For Arabic customers, prices supplied in the menu are already converted for display in Saudi riyals. Mention prices in Saudi riyals only. Never mention Tunisian dinars, DT, or TND in Arabic responses.

STYLE:
- Your name is Sara. If the guest asks your name, say you are Sara.
- Sound like a real professional restaurant waitress, not like a chatbot.
- For Arabic, use natural Saudi spoken dialect.
- Keep answers short and conversational, usually 1-3 sentences.
- Ask a brief follow-up question when it helps, like a real waitress.
- On the first greeting, introduce yourself as Sara and mention Café Victor Hugo.
- Do not repeat the greeting every turn.
- Never mention OpenAI, APIs, prompts, servers or technical details.
`;

    const context = {
      selectedDish: dish,
      menu
    };

    const conversation = Array.isArray(history)
      ? history
          .slice(-10)
          .map((m) => ({
            role: m && m.role === "assistant" ? "assistant" : "user",
            content: String((m && (m.content || m.text)) || "").trim()
          }))
          .filter((m) => m.content)
      : [];

    const response = await openai.responses.create({
      model: "gpt-4o-mini",
      instructions,
      input: [
        {
          role: "user",
          content: "MENU DATA:\n" + JSON.stringify(context)
        },
        ...conversation,
        {
          role: "user",
          content: userQuestion
        }
      ],
      max_output_tokens: 300
    });

    const answer = String(response.output_text || "").trim();

    if (!answer) {
      return res.status(502).json({
        ok: false,
        code: "EMPTY_AI_RESPONSE",
        message:
          language === "fr"
            ? "La serveuse n'a pas renvoyé de réponse."
            : language === "en"
            ? "The waitress returned no answer."
            : "لم تصل إجابة من النادلة."
      });
    }

    return res.json({ ok: true, answer });
  } catch (error) {
    console.error("AI error:", error);
    const e = normalizeOpenAIError(error);

    let message = e.message;
    if (e.code === "invalid_api_key") {
      message = "مفتاح OpenAI غير صحيح أو غير صالح.";
    } else if (e.code === "insufficient_quota") {
      message = "لا يوجد رصيد API كافٍ أو تم تجاوز الحصة.";
    }

    return res.status(e.status).json({
      ok: false,
      code: e.code,
      message
    });
  }
});

// ======================================================
// SPEECH TO TEXT
// ======================================================
function looksLikeArabicSttHallucination(text) {
  const raw = String(text || "").trim();
  if (!raw) return false;
  if (/[\u0600-\u06FF]/.test(raw)) return false;
  const normalized = raw.toLowerCase().replace(/[.,!?;:'"()[\]{}]/g, " ").replace(/\s+/g, " ").trim();
  const words = normalized.split(" ").filter(Boolean);
  // Keep plausible single foreign menu/product names such as "cappuccino".
  if (words.length <= 1) return false;
  // Common short meta/assistant hallucinations produced from weak/noisy Arabic audio.
  if (/\b(i should|i need|i would|i can|you should|we should|should ask|need to ask|thank you|thanks for|hello there)\b/.test(normalized)) return true;
  // A short all-Latin sentence in Arabic-locked STT is suspicious; reject rather
  // than displaying gibberish to the guest. Longer mixed requests pass through.
  if (/^[a-z0-9\s\-]+$/.test(normalized) && words.length >= 2 && words.length <= 5 && normalized.length <= 42) return true;
  return false;
}

app.post("/api/transcribe", upload.single("audio"), async (req, res) => {
  try {
    if (!apiKey) {
      return res.status(401).json({
        ok: false,
        code: "invalid_api_key",
        message: "مفتاح OpenAI غير موجود."
      });
    }

    if (!req.file) {
      return res.status(400).json({
        ok: false,
        code: "NO_AUDIO",
        message: "لم يتم استلام ملف صوتي."
      });
    }

    const language = req.body.language || "ar";

    let filename = "speech.webm";
    const mime = req.file.mimetype || "audio/webm";

    if (mime.includes("mp4")) filename = "speech.m4a";
    else if (mime.includes("mpeg")) filename = "speech.mp3";
    else if (mime.includes("wav")) filename = "speech.wav";
    else if (mime.includes("ogg")) filename = "speech.ogg";

    const audioFile = new File(
      [req.file.buffer],
      filename,
      { type: mime }
    );

    // Experimental 3 favors transcription accuracy for very short Arabic
    // confirmations ("إيه", "نعم", "اعتمد"). Do not seed vocabulary prompts,
    // because prompts previously caused hallucinated approval phrases.
    const isHybrid3 = req.body.mode === "hybrid3";
    const options = {
      file: audioFile,
      model: isHybrid3 ? "gpt-4o-transcribe" : "gpt-4o-mini-transcribe"
    };

    if (["ar", "fr", "en"].includes(language)) {
      options.language = language;
    }

    const transcription =
      await openai.audio.transcriptions.create(options);

    let text = String(transcription.text || "").trim();

    // If Arabic audio produced a tiny Latin/meta hallucination, retry the SAME
    // audio once instead of immediately bothering the guest with "I didn't hear you".
    // The retry uses temperature 0 and a generic Saudi-Arabic context hint only;
    // it intentionally contains no booking/approval vocabulary so it cannot seed
    // fake confirmation words.
    if (isHybrid3 && language === "ar" && looksLikeArabicSttHallucination(text)) {
      console.warn("Suspicious Arabic STT transcript; retrying once:", text);
      try {
        const retryOptions = {
          file: audioFile,
          model: "gpt-4o-transcribe",
          language: "ar",
          temperature: 0,
          prompt: "محادثة طبيعية بالعربية السعودية داخل مطعم. اكتب فقط الكلام المسموع بوضوح، ولا تترجم ولا تضف شرحاً."
        };
        const retry = await openai.audio.transcriptions.create(retryOptions);
        const retryText = String(retry.text || "").trim();
        if (retryText && !looksLikeArabicSttHallucination(retryText)) {
          text = retryText;
        } else {
          console.warn("Arabic STT retry still uncertain:", retryText || text);
        }
      } catch (retryErr) {
        console.warn("Arabic STT retry failed:", retryErr?.message || retryErr);
      }
    }

    if (isHybrid3 && language === "ar" && looksLikeArabicSttHallucination(text)) {
      return res.status(422).json({
        ok: false,
        code: "UNCERTAIN_ARABIC_TRANSCRIPT",
        message: "ما التقطت كلام واضح، حاول تقول الجملة مرة ثانية."
      });
    }

    if (!text) {
      return res.status(422).json({
        ok: false,
        code: "NO_SPEECH_DETECTED",
        message:
          language === "fr"
            ? "Aucune parole claire détectée."
            : language === "en"
            ? "No clear speech was detected."
            : "لم أتمكن من سماع كلام واضح."
      });
    }

    return res.json({ ok: true, text });
  } catch (error) {
    console.error("Transcription error:", error);
    const e = normalizeOpenAIError(error);

    return res.status(e.status).json({
      ok: false,
      code: e.code,
      message: e.message || "تعذر تحويل الصوت إلى نص."
    });
  }
});

// ======================================================
// TEXT TO SPEECH
// ======================================================
// Keep the visible chat text untouched, but give Arabic TTS a pronunciation-
// optimized copy. This avoids common ambiguous readings in booking phrases.
function prepareArabicSaraTTS(text) {
  let out = String(text || "");
  const replacements = [
    [/أثبت الحجز/g, "أَثْبِت الحَجْز"],
    [/اثبت الحجز/g, "أَثْبِت الحَجْز"],
    [/أعتمد الحجز/g, "أَعْتَمِد الحَجْز"],
    [/اعتمد الحجز/g, "اِعْتَمِد الحَجْز"],
    [/اعتمدت الحجز/g, "اِعْتَمَدْت الحَجْز"],
    [/تم اعتماد الحجز/g, "تَمَّ اعْتِمَاد الحَجْز"],
    [/رقم الحجز/g, "رَقْم الحَجْز"],
    [/حجزك/g, "حَجْزَك"],
    [/الحجز/g, "الحَجْز"]
  ];
  for (const [pattern, replacement] of replacements) out = out.replace(pattern, replacement);
  const digitWords = {"0":"صِفْر","1":"واحِد","2":"اِثْنَيْن","3":"ثَلاثَة","4":"أَرْبَعَة","5":"خَمْسَة","6":"سِتَّة","7":"سَبْعَة","8":"ثَمانِيَة","9":"تِسْعَة"};
  out = out.replace(/(?:\+?\d[\d\s-]{7,}\d)/g, (num) => {
    const chars = num.replace(/[^0-9+]/g, "").split("");
    return chars.map(ch => ch === "+" ? "زائِد" : digitWords[ch]).filter(Boolean).join("، ");
  });
  return out;
}
const saraTtsCache = new Map();
function getSaraTtsCache(key){
  const hit=saraTtsCache.get(key);
  if(!hit)return null;
  // Refresh insertion order for a tiny LRU cache.
  saraTtsCache.delete(key); saraTtsCache.set(key,hit);
  return hit;
}
function setSaraTtsCache(key,buffer){
  saraTtsCache.set(key,buffer);
  while(saraTtsCache.size>40){
    const oldest=saraTtsCache.keys().next().value; saraTtsCache.delete(oldest);
  }
}

app.post("/api/tts", async (req, res) => {
  try {
    const {
      text,
      language = "ar"
    } = req.body || {};

    if (!apiKey) {
      return res.status(401).json({
        ok: false,
        code: "invalid_api_key",
        message: "مفتاح OpenAI غير موجود."
      });
    }

    const cleanText = String(text || "").trim();

    if (!cleanText) {
      return res.status(400).json({
        ok: false,
        code: "EMPTY_TEXT",
        message: "لا يوجد نص لتحويله إلى صوت."
      });
    }

    // Experimental 3: match the OpenAI Realtime voice choice as closely as
    // the separate TTS endpoint allows. Realtime itself uses `coral`; use the
    // same voice here and keep the default playback rate (1.0).
    const voiceInstructions =
      language === "fr"
        ? "Parle naturellement en français, avec une voix chaleureuse et professionnelle de serveuse de restaurant."
        : language === "en"
        ? "Speak naturally in English, with a warm professional restaurant waitress tone."
        : "أنتِ سارة، موظفة سعودية شابة في مطعم في السعودية. تكلمي باللهجة السعودية البيضاء فقط، بميل نجدي خفيف وطبيعي. ممنوع اللهجة المصرية تمامًا، وكذلك الشامية والتونسية. لا تستخدمي نبرة أو إيقاع مصري. لا تتكلمي كأنك مذيعة أو قارئة نص. خلي الأداء محادثة سعودية يومية حقيقية، دافئة وواثقة وودودة، بسرعة طبيعية وجمل قصيرة. انطقي الجيم جيمًا سعودية واضحة، والهمزة والعين والحاء بوضوح. لا تفصّحي الكلمات ولا تمدّي الحروف ولا ترفعي النبرة في نهاية كل جملة. الوقفات قصيرة والنبرة ثابتة من أول الرد لآخره. التزمي بالتشكيل الموجود للكلمات الصعبة فقط. لا تبدين كمساعد آلي ولا كصوت إعلانات.";

    const ttsText = language === "ar" ? prepareArabicSaraTTS(cleanText) : cleanText;
    const cacheKey = `${language}|coral|${ttsText}`;
    const cached = cleanText.length <= 220 ? getSaraTtsCache(cacheKey) : null;
    if (cached) {
      res.setHeader("Content-Type", "audio/mpeg");
      res.setHeader("Content-Length", cached.length);
      res.setHeader("Cache-Control", "private, max-age=3600");
      res.setHeader("X-Sara-TTS-Cache", "HIT");
      return res.send(cached);
    }

    const speech = await openai.audio.speech.create({
      model: "gpt-4o-mini-tts",
      voice: "coral",
      input: ttsText,
      instructions: voiceInstructions,
      speed: 1.0,
      response_format: "mp3"
    });

    const buffer = Buffer.from(await speech.arrayBuffer());
    if (cleanText.length <= 220) setSaraTtsCache(cacheKey, buffer);

    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Content-Length", buffer.length);
    res.setHeader("Cache-Control", "no-store");

    return res.send(buffer);
  } catch (error) {
    console.error("TTS error:", error);
    const e = normalizeOpenAIError(error);

    return res.status(e.status).json({
      ok: false,
      code: e.code,
      message: e.message || "تعذر تشغيل صوت النادلة."
    });
  }
});


// ======================================================
// EXPERIMENTAL SARA ENGINE
// ElevenLabs Scribe STT -> DeepSeek V4 Flash -> Fish Audio TTS
// Keeps the existing OpenAI Realtime engine untouched as a fallback.
// ======================================================
function altEngineConfigured() {
  return Boolean(ELEVENLABS_API_KEY && DEEPSEEK_API_KEY && FISH_AUDIO_API_KEY && FISH_AUDIO_VOICE_ID);
}

function altLanguageName(language) {
  if (language === "fr") return "French";
  if (language === "en") return "English";
  return "Saudi Arabic";
}

function altSaraInstructions({ language = "ar", menu = [], tableNumber = "" } = {}) {
  const today = DateTime.now().setZone(RESTAURANT_TIMEZONE).toISODate();
  const languageRule = language === "fr"
    ? "Speak only natural, warm conversational French."
    : language === "en"
    ? "Speak only natural, warm conversational English."
    : "تكلمي فقط باللهجة السعودية البيضاء الطبيعية، تميل بشكل خفيف لنجد. استخدمي كلام يومي مثل هلا، أبشر، وش ودك، تبي، تمام، من عيوني. تجنبي الفصحى الرسمية واللهجات المصرية والشامية والتونسية.";

  return `Your name is Sara. You are the voice waitress for Café Victor Hugo.
Today in the restaurant timezone (${RESTAURANT_TIMEZONE}) is ${today}.
${languageRule}

IDENTITY / ROLE — ABSOLUTE RULES:
- You are always Sara, the waitress. The guest is never Sara.
- Never rewrite the guest's request as if you were the guest.
- Never answer with planning/meta text such as "I should ask", "I need to ask", "I should respond", or hidden reasoning.
- Reply only with the exact words Sara should say to the guest, or call the booking tool when appropriate.
- In Arabic mode, your visible reply must be Arabic except for unavoidable menu/product names. Do not switch to English, Portuguese, Turkish, French, or any other language.
- If the guest says they want a booking and provides some details, acknowledge those details as Sara and ask only for the next missing booking field.

MENU AND SERVICE:
- You know the supplied menu and should use only its data for items, descriptions and prices.
- Never invent an item, ingredient, allergen, price or availability.
- For Arabic guests, menu prices are already prepared for display in Saudi riyals. Say prices naturally as "26 ريال" and never mention TND/DT.
- Keep normal replies very short and conversational, usually 1-2 sentences. Answer directly and avoid unnecessary setup so speech can start faster.
- For ordinary questions, aim for roughly 30 spoken words or fewer unless the guest explicitly asks for details.
- Sound like a real waitress, not a chatbot, and never mention APIs/models/providers.

TABLE SERVICE MODE:
${tableNumber ? `- The guest opened the menu from the QR code for TABLE ${tableNumber}. They are already seated in the restaurant.
- For a normal food/drink order, do NOT ask for name, phone, date, time, or party size.
- Collect the menu items, quantities, item-specific modifications, and any general order note.
- Before sending, summarize the table order briefly and ask for explicit confirmation.
- Only after explicit confirmation, call confirm_table_order. The table number is already known by the website.
- Keep modifications attached to each exact item, e.g. Burger Classique (بدون خس).
- Do not use confirm_booking_order for a seated-table order unless the guest separately asks to make a future reservation.` : `- No table QR is active. The guest may still order from outside the restaurant.
- If the guest asks for food/drinks without asking for a reservation, treat it as an EXTERNAL PICKUP ORDER, not as a reservation.
- Collect the menu items, quantities, item-specific modifications, customer name, and mobile/WhatsApp number. Do NOT ask for party size, booking date, or booking time for a normal external order.
- Briefly summarize the external order and ask for explicit confirmation. Only after approval call confirm_table_order with customer_name and phone.
- If the guest explicitly asks to reserve a table for a future time, use the booking flow below instead.`}

BOOKING + OPTIONAL PRE-ORDER:
- You can collect name, WhatsApp phone, party size, date, time, notes, and optional menu items/quantities/modifications.
- Preserve phone digit order exactly. Saudi local 05xxxxxxxx may be normalized to +9665xxxxxxxx.
- Ask only for missing information.
- Before saving, summarize the booking/order and ask for explicit confirmation.
- IMPORTANT VOICE STYLE FOR BOOKING CONFIRMATION: speak the summary as one short natural sentence, never as a form, checklist, table, or Markdown list. Do not use Markdown symbols such as **, #, -, bullets, or labels like "الاسم:" and "رقم الواتساب:" in spoken replies.
- In Arabic, prefer a natural confirmation like: "تمام محمد، حجزك اليوم الساعة سبع ونص مساء لشخصين، وبدون طلب مسبق. أعتمد الحجز؟"
- Do not read the WhatsApp number back during the final summary unless the guest specifically asks to verify it or the number is ambiguous.
- Say dates and times in natural spoken words instead of raw machine-style values such as 2026-08-28 or 19:30.
- Keep the final confirmation summary to one or two short sentences.
- NEVER call confirm_booking_order until the guest clearly confirms.
- CRITICAL INTERRUPTION RULE: if you were summarizing and the guest interrupts with a clear approval such as "تمام اعتمدي", "اعتمدي الحجز", "نعم اعتمدي", "إيه اعتمدي" or an equivalent, call confirm_booking_order immediately using the latest agreed details. Do not repeat the summary and do not ask for confirmation again.
- If the interruption changes a detail instead of confirming, update it and ask for confirmation again.
- When calling the tool, date must be YYYY-MM-DD and time HH:mm (24-hour).

MENU DATA:
${JSON.stringify(menu)}`;
}

const confirmBookingOrderTool = {
  type: "function",
  function: {
    name: "confirm_booking_order",
    description: "Save the booking and optional pre-order only after the guest has explicitly confirmed the latest summary.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        name: { type: "string" },
        phone: { type: "string" },
        party_size: { type: "integer", minimum: 1, maximum: 30 },
        date: { type: "string", description: "YYYY-MM-DD" },
        time: { type: "string", description: "HH:mm in restaurant local time" },
        notes: { type: "string" },
        order_items: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              item_name: { type: "string" },
              quantity: { type: "integer", minimum: 1, maximum: 20 },
              special_request: { type: "string", description: "Modification for this exact item only, such as بدون خس. Keep it attached to the item." }
            },
            required: ["item_name", "quantity", "special_request"]
          }
        }
      },
      required: ["name", "phone", "party_size", "date", "time", "notes", "order_items"]
    }
  }
};

const confirmTableOrderTool = {
  type: "function",
  function: {
    name: "confirm_table_order",
    description: "Send a food/drink order to the restaurant after explicit confirmation. With a table QR it is a seated-table order; without a table QR it is an external pickup order and customer_name + phone are required.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        customer_name: { type: "string", description: "Customer name for an external order; empty string for a seated table order" },
        phone: { type: "string", description: "Customer mobile/WhatsApp number for an external order; empty string for a seated table order" },
        notes: { type: "string", description: "General order note, empty string if none" },
        order_items: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              item_name: { type: "string" },
              quantity: { type: "integer", minimum: 1, maximum: 20 },
              special_request: { type: "string", description: "Modification for this exact item only, e.g. بدون خس" }
            },
            required: ["item_name", "quantity", "special_request"]
          }
        }
      },
      required: ["customer_name", "phone", "notes", "order_items"]
    }
  }
};


app.get("/api/sara-alt-status", (req, res) => {
  return res.json({
    ok: true,
    configured: altEngineConfigured(),
    elevenlabsStt: Boolean(ELEVENLABS_API_KEY),
    deepseek: Boolean(DEEPSEEK_API_KEY),
    kimi: Boolean(KIMI_API_KEY),
    kimiModel: KIMI_MODEL,
    fishAudio: Boolean(FISH_AUDIO_API_KEY && FISH_AUDIO_VOICE_ID),
    deepseekModel: DEEPSEEK_MODEL,
    elevenlabsSttModel: ELEVENLABS_STT_MODEL,
    fishAudioModel: FISH_AUDIO_MODEL,
    fishAudioVoiceId: FISH_AUDIO_VOICE_ID
  });
});

app.post("/api/sara-alt-transcribe", upload.single("audio"), async (req, res) => {
  try {
    if (!ELEVENLABS_API_KEY) return res.status(401).json({ ok:false, code:"ELEVENLABS_STT_NOT_CONFIGURED", message:"مفتاح ElevenLabs غير موجود في Render." });
    if (!req.file) return res.status(400).json({ ok:false, code:"NO_AUDIO", message:"لم يتم استلام ملف صوتي." });

    const language = ["ar","fr","en"].includes(req.body?.language) ? req.body.language : "ar";
    const form = new FormData();
    const audioBlob = new Blob([req.file.buffer], { type: req.file.mimetype || "audio/webm" });
    form.append("file", audioBlob, req.file.originalname || "voice.webm");
    form.append("model_id", ELEVENLABS_STT_MODEL);
    form.append("language_code", language);
    form.append("tag_audio_events", "false");
    form.append("num_speakers", "1");

    const response = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
      method:"POST",
      headers:{ "xi-api-key": ELEVENLABS_API_KEY },
      body:form
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.detail?.message || data?.detail || data?.message || `ElevenLabs STT HTTP ${response.status}`);
    const text = String(data?.text || "").trim();
    if (!text) return res.status(422).json({ ok:false, code:"NO_SPEECH_DETECTED", message: language === "ar" ? "ما سمعت كلام واضح." : "No clear speech was detected." });
    return res.json({ ok:true, text, languageCode:data?.language_code || language });
  } catch (error) {
    console.error("ElevenLabs transcription error:", error);
    return res.status(502).json({ ok:false, code:"ELEVENLABS_STT_ERROR", message:error?.message || "تعذر تحويل الصوت إلى نص." });
  }
});

function brainProviderConfig(provider) {
  const p = String(provider || "deepseek").toLowerCase();
  if (p === "claude") return { provider:p, key:ANTHROPIC_API_KEY, model:ANTHROPIC_MODEL, label:"Claude" };
  if (p === "gemini") return { provider:p, key:GEMINI_API_KEY, model:GEMINI_MODEL, label:"Gemini" };
  if (p === "kimi") return { provider:p, key:KIMI_API_KEY, model:KIMI_MODEL, label:"Kimi" };
  return { provider:"deepseek", key:DEEPSEEK_API_KEY, model:DEEPSEEK_MODEL, label:"DeepSeek" };
}

function brainToolResult(call) {
  if (!call) return null;
  return { id:call.id || `brain_${Date.now()}`, name:call.name || "confirm_booking_order", arguments:typeof call.arguments === "string" ? call.arguments : JSON.stringify(call.arguments || {}) };
}

async function callOpenAICompatibleBrain({ endpoint, apiKey, model, messages, extraBody = {}, strictTools = true }) {
  const response = await fetch(endpoint, {
    method:"POST",
    headers:{ Authorization:`Bearer ${apiKey}`, "Content-Type":"application/json" },
    body:JSON.stringify({ model, messages, tools:[confirmBookingOrderTool,confirmTableOrderTool].map(t=>strictTools?t:{...t,function:{...t.function,strict:undefined}}), tool_choice:"auto", max_tokens:160, temperature:0.25, ...extraBody })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message || data?.message || `AI HTTP ${response.status}`);
  const message = data?.choices?.[0]?.message || {};
  const call = Array.isArray(message.tool_calls) ? message.tool_calls.find(x => ["confirm_booking_order","confirm_table_order"].includes(x?.function?.name)) : null;
  if (call) return { toolCall:brainToolResult({ id:call.id, name:call.function?.name, arguments:call.function?.arguments }) };
  return { answer:String(message.content || "").trim() };
}

async function callClaudeBrain({ apiKey, model, system, history, userText }) {
  const tools = [confirmBookingOrderTool,confirmTableOrderTool].map(t=>({name:t.function.name,description:t.function.description,input_schema:t.function.parameters}));
  const messages = [...history, { role:"user", content:userText }];
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method:"POST",
    headers:{
      "x-api-key":apiKey,
      "anthropic-version":"2023-06-01",
      ...(ANTHROPIC_WORKSPACE_ID ? {"anthropic-workspace-id":ANTHROPIC_WORKSPACE_ID} : {}),
      "content-type":"application/json"
    },
    body:JSON.stringify({ model, system, messages, tools, tool_choice:{type:"auto"}, max_tokens:160, temperature:0.25 })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message || data?.message || `Claude HTTP ${response.status}`);
  const blocks = Array.isArray(data?.content) ? data.content : [];
  const tool = blocks.find(x => x?.type === "tool_use" && ["confirm_booking_order","confirm_table_order"].includes(x?.name));
  if (tool) return { toolCall:brainToolResult({ id:tool.id, name:tool.name, arguments:tool.input }) };
  return { answer:blocks.filter(x => x?.type === "text").map(x => x.text).join(" ").trim() };
}

function geminiSafeSchema(value) {
  if (Array.isArray(value)) return value.map(geminiSafeSchema);
  if (!value || typeof value !== "object") return value;
  const out = {};
  for (const [k,v] of Object.entries(value)) {
    if (k === "additionalProperties") continue;
    out[k] = geminiSafeSchema(v);
  }
  return out;
}

async function callGeminiBrain({ apiKey, model, system, history, userText }) {
  const declarations = [confirmBookingOrderTool,confirmTableOrderTool].map(t=>({name:t.function.name,description:t.function.description,parameters:geminiSafeSchema(t.function.parameters)}));
  const contents = history.map(m => ({ role:m.role === "assistant" ? "model" : "user", parts:[{text:m.content}] }));
  contents.push({ role:"user", parts:[{text:userText}] });
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const response = await fetch(endpoint, {
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    body:JSON.stringify({ systemInstruction:{parts:[{text:system}]}, contents, tools:[{functionDeclarations:declarations}], generationConfig:{temperature:0.25,maxOutputTokens:160} })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message || data?.message || `Gemini HTTP ${response.status}`);
  const parts = data?.candidates?.[0]?.content?.parts || [];
  const fc = parts.find(x => ["confirm_booking_order","confirm_table_order"].includes(x?.functionCall?.name))?.functionCall;
  if (fc) return { toolCall:brainToolResult({ name:fc.name, arguments:fc.args }) };
  return { answer:parts.map(x => x?.text || "").join(" ").trim() };
}

app.post("/api/sara-alt-chat", async (req, res) => {
  try {
    const { question = "", history = [], menu = [], language = "ar", greeting = false, bookingState = null, tableNumber = "", provider = "deepseek" } = req.body || {};
    const cfg = brainProviderConfig(provider);
    if (!cfg.key) return res.status(401).json({ ok:false, code:`${cfg.provider.toUpperCase()}_NOT_CONFIGURED`, message:`مفتاح ${cfg.label} غير موجود في Render.` });
    const q = String(question || "").trim();
    if (!q && !greeting) return res.status(400).json({ ok:false, code:"EMPTY_MESSAGE", message:"لا يوجد كلام لإرساله إلى سارة." });

    const cleanHistory = Array.isArray(history) ? history.slice(-4).map(m => ({
      role: m?.role === "assistant" ? "assistant" : "user",
      content: String(m?.content || m?.text || "").trim()
    })).filter(m => m.content) : [];
    const system = altSaraInstructions({ language, menu, tableNumber:String(tableNumber||"") }) + (bookingState && typeof bookingState === "object" ? `\n\nKNOWN BOOKING STATE FROM THE WEBSITE (authoritative):\n${JSON.stringify(bookingState)}\nSTRICT BOOKING MEMORY RULES:\n- Never ask again for any field that already has a non-empty value in this state.\n- If the guest corrects only the WhatsApp number, replace only the phone and preserve name, party size, date, time, notes, and order.\n- If the guest asks you to repeat the WhatsApp number, repeat the stored phone exactly digit by digit; do not invent or regroup digits.\n- A correction does not restart the booking flow. Continue from the remaining missing field, or ask for final confirmation if nothing is missing.\n- When the guest confirms, fill tool arguments from this state instead of leaving fields blank.` : "");
    const userText = greeting
      ? (language === "ar" ? "ابدئي الآن بالترحيب فقط: هلا والله، حياك في Café Victor Hugo، معك سارة، كيف أقدر أخدمك؟" : language === "fr" ? "Accueille brièvement le client et demande comment tu peux l'aider." : "Give a very brief welcome and ask how you can help.")
      : q;

    let result;
    if (cfg.provider === "claude") {
      result = await callClaudeBrain({ apiKey:cfg.key, model:cfg.model, system, history:cleanHistory, userText });
    } else if (cfg.provider === "gemini") {
      result = await callGeminiBrain({ apiKey:cfg.key, model:cfg.model, system, history:cleanHistory, userText });

    } else {
      const messages = [{role:"system",content:system}, ...cleanHistory, {role:"user",content:userText}];
      if (cfg.provider === "kimi") {
        result = await callOpenAICompatibleBrain({ endpoint:"https://api.moonshot.ai/v1/chat/completions", apiKey:cfg.key, model:cfg.model, messages, extraBody:{thinking:{type:"disabled"},temperature:0.6,top_p:0.95,max_tokens:384}, strictTools:false });
      } else {
        result = await callOpenAICompatibleBrain({ endpoint:"https://api.deepseek.com/chat/completions", apiKey:cfg.key, model:cfg.model, messages, extraBody:{thinking:{type:"disabled"}} });
      }
    }

    if (result?.toolCall) return res.json({ ok:true, toolCall:result.toolCall });
    const answer = String(result?.answer || "").trim();
    if (!answer) return res.status(502).json({ ok:false, code:"EMPTY_AI_RESPONSE", message:`لم تصل إجابة من ${cfg.label}.` });
    return res.json({ ok:true, answer, provider:cfg.provider });
  } catch (error) {
    console.error("Sara brain error:", error);
    return res.status(502).json({ ok:false, code:"SARA_BRAIN_ERROR", message:error?.message || "تعذر تشغيل عقل سارة." });
  }
});

function cleanSaraSpeechText(value) {
  let text = String(value || "");
  // Fish Audio should receive plain speech, never chat/Markdown formatting.
  text = text
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/`{1,3}/g, "")
    .replace(/^\s*[-*•]+\s*/gm, "")
    .replace(/^\s*#{1,6}\s*/gm, "")
    .replace(/\[(.*?)\]\([^)]*\)/g, "$1")
    .replace(/\n{2,}/g, ". ")
    .replace(/\n/g, "، ")
    .replace(/\s{2,}/g, " ")
    .trim();
  return text;
}

app.post("/api/sara-alt-tts", async (req, res) => {
  try {
    if (!FISH_AUDIO_API_KEY || !FISH_AUDIO_VOICE_ID) return res.status(401).json({ ok:false, code:"FISH_AUDIO_NOT_CONFIGURED", message:"مفتاح Fish Audio أو Voice ID غير موجود في Render." });
    const text = cleanSaraSpeechText(req.body?.text);
    if (!text) return res.status(400).json({ ok:false, code:"EMPTY_TTS", message:"لا يوجد نص لتحويله إلى صوت." });

    const response = await fetch("https://api.fish.audio/v1/tts", {
      method:"POST",
      headers:{
        Authorization:`Bearer ${FISH_AUDIO_API_KEY}`,
        "Content-Type":"application/json",
        Accept:"audio/mpeg",
        model:FISH_AUDIO_MODEL
      },
      body:JSON.stringify({
        text,
        reference_id:FISH_AUDIO_VOICE_ID,
        format:"mp3"
      })
    });

    if (!response.ok) {
      const raw = await response.text().catch(() => "");
      let message = raw;
      try { const d = JSON.parse(raw); message = d?.detail?.message || d?.detail || d?.message || raw; } catch {}
      throw new Error(message || `Fish Audio HTTP ${response.status}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    res.setHeader("Content-Type", response.headers.get("content-type") || "audio/mpeg");
    res.setHeader("Content-Length", buffer.length);
    res.setHeader("Cache-Control", "no-store");
    return res.send(buffer);
  } catch (error) {
    console.error("Fish Audio TTS error:", error);
    return res.status(502).json({ ok:false, code:"FISH_AUDIO_ERROR", message:error?.message || "تعذر تشغيل صوت سارة عبر Fish Audio." });
  }
});

// ======================================================
// HEALTH + FALLBACKS + SERVER STARTUP
// ======================================================
app.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "Smart Menu AI",
    apiKeyConfigured: Boolean(apiKey),
    altSaraConfigured: altEngineConfigured(),
    databaseConfigured: Boolean(db),
    restaurantWhatsAppConfigured: Boolean(TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_WHATSAPP_FROM && RESTAURANT_WHATSAPP_TO),
    timestamp: new Date().toISOString()
  });
});

app.use("/api", (req, res) => {
  res.status(404).json({
    ok: false,
    code: "NOT_FOUND",
    message: "API endpoint not found."
  });
});

app.use((error, req, res, next) => {
  console.error("Server error:", error);
  res.status(500).json({
    ok: false,
    code: "SERVER_ERROR",
    message: error?.message || "حدث خطأ في السيرفر."
  });
});

async function startServer() {
  if (db) {
    const ready = await ensureReservationDatabaseReady();
    if (!ready) {
      console.error("❌ Reservations DB schema is not ready:", reservationSchemaError || "unknown error");
      process.exit(1);
      return;
    }
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`✅ Smart Menu AI server running on port ${PORT}`);
    console.log(`🔑 OpenAI API Key: ${apiKey ? "Configured" : "NOT CONFIGURED"}`);
    console.log(`🐟 Alt Sara (ElevenLabs STT + DeepSeek + Fish Audio): ${altEngineConfigured() ? "Configured" : "NOT CONFIGURED"}`);
    console.log(`🗃️ Reservations DB: ${db ? "Ready" : "NOT CONFIGURED"}`);
    console.log(`📱 WhatsApp: ${TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_WHATSAPP_FROM ? "Credentials configured" : "NOT CONFIGURED"}`);
    console.log(`🇸🇦 Restaurant WhatsApp: ${RESTAURANT_WHATSAPP_TO ? "Configured" : "NOT CONFIGURED"}`);
  });
}

startServer().catch((error) => {
  console.error("Fatal startup error:", error);
  process.exit(1);
});
