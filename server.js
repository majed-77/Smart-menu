const express = require("express");
const path = require("path");
const OpenAI = require("openai");
const multer = require("multer");
const { Pool } = require("pg");
const { DateTime } = require("luxon");

const app = express();
const PORT = process.env.PORT || 3000;
const apiKey = process.env.OPENAI_API_KEY || "";
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
      status TEXT NOT NULL DEFAULT 'confirmed',
      reminder_sent_at TIMESTAMPTZ,
      reminder_message_sid TEXT,
      reminder_attempts INTEGER NOT NULL DEFAULT 0,
      reminder_last_error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE reservations ADD COLUMN IF NOT EXISTS order_items JSONB NOT NULL DEFAULT '[]'::jsonb;
    ALTER TABLE reservations ADD COLUMN IF NOT EXISTS order_total_sar NUMERIC(12,2) NOT NULL DEFAULT 0;
    ALTER TABLE reservations ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'form';
    CREATE SEQUENCE IF NOT EXISTS reservation_number_seq START WITH 1 INCREMENT BY 1 MINVALUE 1;
    CREATE INDEX IF NOT EXISTS reservations_reminder_due_idx
      ON reservations (reservation_at)
      WHERE reminder_sent_at IS NULL AND status = 'confirmed';
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
                    special_request: { type: "string", description: "Item modification/request, empty string if none" }
                  },
                  required: ["item_name", "quantity", "special_request"]
                }
              }
            },
            required: ["name", "phone", "party_size", "date", "time", "notes", "order_items"]
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

    const options = {
      file: audioFile,
      model: "gpt-4o-mini-transcribe"
    };

    if (["ar", "fr", "en"].includes(language)) {
      options.language = language;
    }

    const transcription =
      await openai.audio.transcriptions.create(options);

    const text = String(transcription.text || "").trim();

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

    const voiceInstructions =
      language === "fr"
        ? "Parle naturellement en français, avec une voix chaleureuse et professionnelle de serveuse de restaurant."
        : language === "en"
        ? "Speak naturally in English, with a warm professional restaurant waitress tone."
        : "تحدث بلهجة سعودية بيضاء طبيعية تميل لنجد، بصوت أنثوي واضح ومشرق وغير مكتوم، وبسرعة متوسطة أبطأ قليلًا من الكلام السريع. انطق الحروف والكلمات بوضوح، وخفف التمطيط والهمهمة. استخدم تعبيرات سعودية يومية بشكل طبيعي مثل: هلا، وش ودك، أبشر، تمام، من عيوني. لا تستخدم اللهجة المصرية أو الشامية أو التونسية، ولا تستخدم فصحى رسمية إلا عند الحاجة. اجعل الأداء مثل نادلة سعودية شابة وراقية، دافئة وواثقة ومن دون مبالغة أو تمثيل.";

    const speech = await openai.audio.speech.create({
      model: "gpt-4o-mini-tts",
      voice: "coral",
      input: cleanText,
      instructions: voiceInstructions,
      response_format: "mp3"
    });

    const buffer = Buffer.from(await speech.arrayBuffer());

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

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "Smart Menu AI",
    apiKeyConfigured: Boolean(apiKey),
    reservationsConfigured: Boolean(db),
    whatsappConfigured: Boolean(TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && (TWILIO_WHATSAPP_FROM || TWILIO_MESSAGING_SERVICE_SID)),
    whatsappTemplateConfigured: Boolean(TWILIO_CONTENT_SID),
    restaurantWhatsAppConfigured: Boolean(RESTAURANT_WHATSAPP_TO),
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
    reservationSchemaReady = await ensureReservationDatabaseReady();
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`✅ Smart Menu AI server running on port ${PORT}`);
    console.log(`🔑 OpenAI API Key: ${apiKey ? "Configured" : "NOT CONFIGURED"}`);
    console.log(`🗓️ Reservations DB: ${db ? (reservationSchemaReady ? "Ready" : "Configured but not ready") : "NOT CONFIGURED"}`);
    console.log(`💬 WhatsApp: ${TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN ? "Credentials configured" : "NOT CONFIGURED"}`);
    console.log(`🏪 Restaurant WhatsApp: ${RESTAURANT_WHATSAPP_TO ? `Configured (${TWILIO_TRIAL_CONTENT_SID ? "Twilio Trial ContentSid" : "direct WhatsApp Body"})` : "NOT CONFIGURED"}`);

    // Built-in safety net. For production also configure a Render Cron Job to POST /api/reminders/run every 5 minutes.
    setInterval(() => processDueReservationReminders().catch(err => console.error("Reminder worker error:", err)), 60 * 1000).unref();
    setTimeout(() => processDueReservationReminders().catch(err => console.error("Initial reminder check error:", err)), 10 * 1000).unref();
  });
}

startServer().catch((error) => {
  console.error("Fatal startup error:", error);
  process.exit(1);
});
