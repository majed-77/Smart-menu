"use strict";

const { DateTime } = require("luxon");
const { env } = require("../../config/env");
const { ensureSchemaReady, getSchemaState, pool } = require("../../db/database");
const { cleanText } = require("../../lib/validation");

const RESERVATION_STATUSES = new Set([
  "new",
  "confirmed",
  "arrived",
  "completed",
  "cancelled"
]);

const ORDER_STATUSES = new Set([
  "new",
  "preparing",
  "ready",
  "served",
  "cancelled"
]);

function normalizeWhatsAppPhone(value) {
  const latinDigits = String(value || "")
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)));

  let phone = latinDigits
    .trim()
    .replace(/[\s().-]/g, "")
    .replace(/[^+\d]/g, "");

  if (phone.startsWith("00")) phone = `+${phone.slice(2)}`;
  if (/^05\d{8}$/.test(phone)) phone = `+966${phone.slice(1)}`;
  if (/^\d{8}$/.test(phone)) phone = `+216${phone}`;
  if (/^9665\d{8}$/.test(phone)) phone = `+${phone}`;
  if (/^216\d{8}$/.test(phone)) phone = `+${phone}`;

  return /^\+[1-9]\d{7,14}$/.test(phone) ? phone : "";
}

function normalizeLanguage(value) {
  return ["ar", "en", "fr"].includes(value) ? value : "ar";
}

function normalizeOrderItems(orderItems) {
  if (!Array.isArray(orderItems)) return [];

  return orderItems
    .slice(0, 50)
    .map((item) => {
      const unitPrice = Number(item?.unitPriceSar);
      return {
        name: cleanText(item?.name, 160),
        quantity: Math.max(1, Math.min(20, Math.trunc(Number(item?.quantity) || 1))),
        specialRequest: cleanText(item?.specialRequest, 300),
        unitPriceSar:
          Number.isFinite(unitPrice) && unitPrice >= 0
            ? Math.round(unitPrice * 100) / 100
            : null
      };
    })
    .filter((item) => item.name);
}

function calculateOrderTotal(items) {
  const total = items.reduce(
    (sum, item) =>
      sum +
      (Number.isFinite(item.unitPriceSar)
        ? item.unitPriceSar * item.quantity
        : 0),
    0
  );
  return Math.round(total * 100) / 100;
}

async function nextSequence(sequenceName) {
  const result = await pool.query(
    `SELECT nextval('${sequenceName}')::text AS code`
  );
  return result.rows[0].code;
}

function reservationToPublic(row) {
  const local = DateTime.fromJSDate(new Date(row.reservation_at), { zone: "utc" }).setZone(
    env.restaurantTimezone
  );

  return {
    code: row.confirmation_code,
    name: row.customer_name,
    phone: row.phone,
    partySize: row.party_size,
    date: local.toISODate(),
    time: local.toFormat("HH:mm"),
    timezone: env.restaurantTimezone,
    reminderMinutesBefore: 30,
    notes: row.notes || "",
    orderItems: row.order_items || [],
    orderTotalSar: Number(row.order_total_sar || 0),
    source: row.source,
    status: row.status
  };
}

function twilioWhatsAppFrom() {
  if (!env.twilioWhatsAppFrom) return "";
  return env.twilioWhatsAppFrom.startsWith("whatsapp:")
    ? env.twilioWhatsAppFrom
    : `whatsapp:${env.twilioWhatsAppFrom}`;
}

function reminderCopy(reservation) {
  const local = DateTime.fromJSDate(new Date(reservation.reservation_at), { zone: "utc" }).setZone(
    env.restaurantTimezone
  );
  const name = reservation.customer_name;
  const party = reservation.party_size;

  if (reservation.language === "fr") {
    return `Bonjour ${name} 👋 Rappel de votre réservation aujourd’hui à ${local.toFormat("HH:mm")}, pour ${party} personne${party > 1 ? "s" : ""}. À très bientôt 🌷`;
  }
  if (reservation.language === "en") {
    return `Hi ${name} 👋 This is a reminder for your reservation today at ${local.toFormat("HH:mm")} for ${party} guest${party > 1 ? "s" : ""}. See you soon 🌷`;
  }

  const dateAr = local.setLocale("ar").toFormat("cccc d LLLL");
  const timeAr = local.setLocale("ar").toFormat("h:mm a");
  return `هلا ${name} 👋 تذكير بحجزك ${dateAr} الساعة ${timeAr}، لعدد ${party} ${party === 1 ? "شخص" : "أشخاص"}. ننتظرك 🌷`;
}

function restaurantOrderCopy(reservation) {
  const local = DateTime.fromJSDate(new Date(reservation.reservation_at), { zone: "utc" }).setZone(
    env.restaurantTimezone
  );
  const items = Array.isArray(reservation.order_items) ? reservation.order_items : [];
  const lines = items.length
    ? items
        .map((item, index) => {
          const quantity = Math.max(1, Number(item?.quantity) || 1);
          const name = cleanText(item?.name || "صنف", 160);
          const request = cleanText(item?.specialRequest, 300);
          const price = Number(item?.unitPriceSar);
          const pricePart = Number.isFinite(price)
            ? ` — ${Math.round(price * quantity * 100) / 100} ر.س`
            : "";
          return `${index + 1}) ${quantity} × ${name}${pricePart}${request ? `\n   ملاحظة: ${request}` : ""}`;
        })
        .join("\n")
    : "لا يوجد طلب مسبق";

  const total = Number(reservation.order_total_sar || 0);
  const notes = cleanText(reservation.notes, 500);

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

async function twilioRequest(params) {
  const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(
    env.twilioAccountSid
  )}/Messages.json`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization:
        "Basic " +
        Buffer.from(`${env.twilioAccountSid}:${env.twilioAuthToken}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: params
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.message || `Twilio HTTP ${response.status}`);
  return payload.sid || "sent";
}

async function sendTwilioWhatsApp({ to, body, forceFrom = false }) {
  if (!env.twilioAccountSid || !env.twilioAuthToken) {
    throw new Error("Twilio WhatsApp credentials are not configured.");
  }
  if (!env.twilioMessagingServiceSid && !env.twilioWhatsAppFrom) {
    throw new Error("Set TWILIO_MESSAGING_SERVICE_SID or TWILIO_WHATSAPP_FROM.");
  }

  const destination = normalizeWhatsAppPhone(String(to || "").replace(/^whatsapp:/i, ""));
  if (!destination) throw new Error("Invalid WhatsApp destination number.");

  const params = new URLSearchParams();
  params.set("To", `whatsapp:${destination}`);
  if (!forceFrom && env.twilioMessagingServiceSid) {
    params.set("MessagingServiceSid", env.twilioMessagingServiceSid);
  } else {
    params.set("From", twilioWhatsAppFrom());
  }
  params.set("Body", cleanText(body, 1500));
  return twilioRequest(params);
}

async function sendRestaurantWhatsApp(reservation) {
  if (!env.restaurantWhatsAppTo) throw new Error("RESTAURANT_WHATSAPP_TO is not configured.");
  if (!env.twilioAccountSid || !env.twilioAuthToken || !env.twilioWhatsAppFrom) {
    throw new Error("Twilio WhatsApp credentials are not configured.");
  }

  if (env.twilioTrialContentSid) {
    const destination = normalizeWhatsAppPhone(
      String(env.restaurantWhatsAppTo).replace(/^whatsapp:/i, "")
    );
    if (!destination) throw new Error("Invalid restaurant WhatsApp destination number.");

    const params = new URLSearchParams();
    params.set("To", `whatsapp:${destination}`);
    params.set("From", twilioWhatsAppFrom());
    params.set("ContentSid", env.twilioTrialContentSid);
    return twilioRequest(params);
  }

  return sendTwilioWhatsApp({
    to: env.restaurantWhatsAppTo,
    body: restaurantOrderCopy(reservation),
    forceFrom: true
  });
}

async function sendWhatsAppReminder(reservation) {
  if (!env.twilioAccountSid || !env.twilioAuthToken) {
    throw new Error("Twilio WhatsApp credentials are not configured.");
  }

  const params = new URLSearchParams();
  params.set("To", `whatsapp:${reservation.phone}`);

  if (env.twilioMessagingServiceSid) {
    params.set("MessagingServiceSid", env.twilioMessagingServiceSid);
  } else {
    params.set("From", twilioWhatsAppFrom());
  }

  if (env.twilioContentSid) {
    const local = DateTime.fromJSDate(new Date(reservation.reservation_at), { zone: "utc" }).setZone(
      env.restaurantTimezone
    );
    params.set("ContentSid", env.twilioContentSid);
    params.set(
      "ContentVariables",
      JSON.stringify({
        "1": reservation.customer_name,
        "2": local.toFormat("dd/LL/yyyy"),
        "3": local.toFormat("HH:mm"),
        "4": String(reservation.party_size)
      })
    );
  } else {
    params.set("Body", reminderCopy(reservation));
  }

  return twilioRequest(params);
}

async function processDueReservationReminders() {
  if (!pool) return { checked: 0, sent: 0, failed: 0 };
  const client = await pool.connect();
  let rows = [];

  try {
    await client.query("BEGIN");
    const result = await client.query(`
      SELECT * FROM reservations
      WHERE status IN ('new','confirmed')
        AND reminder_sent_at IS NULL
        AND reservation_at > NOW()
        AND reservation_at <= NOW() + INTERVAL '30 minutes'
      ORDER BY reservation_at ASC
      LIMIT 30
      FOR UPDATE SKIP LOCKED
    `);
    rows = result.rows;
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }

  let sent = 0;
  let failed = 0;
  for (const reservation of rows) {
    try {
      const sid = await sendWhatsAppReminder(reservation);
      await pool.query(
        `UPDATE reservations
         SET reminder_sent_at=NOW(), reminder_message_sid=$1,
             reminder_attempts=reminder_attempts+1, reminder_last_error=NULL, updated_at=NOW()
         WHERE id=$2 AND reminder_sent_at IS NULL`,
        [sid, reservation.id]
      );
      sent += 1;
    } catch (error) {
      failed += 1;
      await pool.query(
        `UPDATE reservations
         SET reminder_attempts=reminder_attempts+1,
             reminder_last_error=$1, updated_at=NOW()
         WHERE id=$2`,
        [cleanText(error?.message || error, 500), reservation.id]
      );
    }
  }

  return { checked: rows.length, sent, failed };
}

async function createReservation(body = {}) {
  if (!pool) throw Object.assign(new Error("نظام الحجز يحتاج DATABASE_URL في Render."), { status: 503, code: "DATABASE_NOT_CONFIGURED" });
  if (!(await ensureSchemaReady())) {
    const state = getSchemaState();
    throw Object.assign(new Error("قاعدة الحجوزات غير جاهزة الآن. حاول مرة ثانية بعد ثوانٍ."), {
      status: 503,
      code: "DATABASE_NOT_READY",
      detail: state.error
    });
  }

  const customerName = cleanText(body.name, 100);
  const phone = normalizeWhatsAppPhone(body.phone);
  const partySize = Number(body.partySize);
  const language = normalizeLanguage(body.language);
  const notes = cleanText(body.notes, 500);
  const items = normalizeOrderItems(body.orderItems);
  const total = calculateOrderTotal(items);
  const source = body.source === "sara_voice" ? "sara_voice" : "form";

  if (customerName.length < 2) throw Object.assign(new Error("اكتب اسم الحجز."), { status: 400, code: "INVALID_NAME" });
  if (!phone) throw Object.assign(new Error("رقم الواتساب غير واضح. قل الرقم كاملًا، ويمكنك قول رقم سعودي يبدأ 05 أو رقم دولي يبدأ +."), { status: 400, code: "INVALID_PHONE" });
  if (!Number.isInteger(partySize) || partySize < 1 || partySize > 30) {
    throw Object.assign(new Error("عدد الأشخاص يجب أن يكون من 1 إلى 30."), { status: 400, code: "INVALID_PARTY_SIZE" });
  }

  const reservationAt = DateTime.fromISO(`${body.date || ""}T${body.time || ""}`, {
    zone: env.restaurantTimezone
  });
  if (!reservationAt.isValid) throw Object.assign(new Error("اختر تاريخ ووقت الحجز بشكل صحيح."), { status: 400, code: "INVALID_DATETIME" });

  const now = DateTime.now().setZone(env.restaurantTimezone);
  if (reservationAt <= now.plus({ minutes: 5 })) {
    throw Object.assign(new Error("اختر موعدًا بعد الوقت الحالي بأكثر من 5 دقائق."), { status: 400, code: "PAST_DATETIME" });
  }
  if (reservationAt > now.plus({ years: 1 })) {
    throw Object.assign(new Error("يمكن الحجز حتى سنة مقدمًا."), { status: 400, code: "TOO_FAR" });
  }

  if (source === "sara_voice") {
    const duplicate = await pool.query(
      `SELECT * FROM reservations
       WHERE source='sara_voice'
         AND phone=$1
         AND customer_name=$2
         AND party_size=$3
         AND reservation_at=$4
         AND COALESCE(notes,'')=$5
         AND COALESCE(order_items,'[]'::jsonb)=$6::jsonb
         AND created_at >= NOW() - INTERVAL '10 minutes'
       ORDER BY created_at DESC
       LIMIT 1`,
      [
        phone,
        customerName,
        partySize,
        reservationAt.toUTC().toISO(),
        notes,
        JSON.stringify(items)
      ]
    );
    if (duplicate.rowCount) {
      return {
        created: false,
        duplicate: true,
        reservation: reservationToPublic(duplicate.rows[0]),
        restaurantWhatsApp: { configured: Boolean(env.restaurantWhatsAppTo), sent: false }
      };
    }
  }

  const code = await nextSequence("reservation_number_seq");
  const inserted = await pool.query(
    `INSERT INTO reservations (
       confirmation_code, customer_name, phone, party_size,
       reservation_at, notes, order_items, order_total_sar, source, language
     ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10)
     RETURNING *`,
    [
      code,
      customerName,
      phone,
      partySize,
      reservationAt.toUTC().toISO(),
      notes,
      JSON.stringify(items),
      total,
      source,
      language
    ]
  );

  const row = inserted.rows[0];
  let restaurantWhatsApp = { configured: Boolean(env.restaurantWhatsAppTo), sent: false };
  if (env.restaurantWhatsAppTo) {
    try {
      const sid = await sendRestaurantWhatsApp(row);
      restaurantWhatsApp = { configured: true, sent: true, sid };
    } catch (error) {
      restaurantWhatsApp = {
        configured: true,
        sent: false,
        error: cleanText(error?.message || error, 300)
      };
      console.error(`Restaurant WhatsApp failed for booking ${row.confirmation_code}:`, error?.message || error);
    }
  }

  return {
    created: true,
    duplicate: false,
    reservation: reservationToPublic(row),
    restaurantWhatsApp
  };
}

async function createTableOrder(body = {}) {
  if (!pool || !(await ensureSchemaReady())) {
    throw Object.assign(new Error("قاعدة الطلبات غير جاهزة."), { status: 503 });
  }

  const rawTable = cleanText(body.tableNumber, 20).replace(/[^0-9A-Za-zأ-ي_-]/g, "");
  const requestedMode = cleanText(body.orderMode, 20).toLowerCase();
  const mode = rawTable ? "table" : requestedMode === "dinein" ? "dinein" : "external";
  const tableNumber = mode === "table" ? rawTable : mode === "dinein" ? "DINEIN" : "OUTSIDE";
  const customerName = cleanText(body.customerName, 120);
  const normalizedPhone = normalizeWhatsAppPhone(body.phone);
  const phone = normalizedPhone || cleanText(body.phone, 40);

  if (mode !== "table" && !customerName) {
    throw Object.assign(
      new Error(mode === "dinein" ? "اكتب اسم العميل لطلب الأكل داخل المطعم." : "اكتب اسم العميل لطلب الاستلام الخارجي."),
      { status: 400, code: "MISSING_CUSTOMER_NAME" }
    );
  }
  if (mode === "external" && !phone) {
    throw Object.assign(new Error("اكتب رقم جوال العميل لطلب الاستلام الخارجي."), { status: 400, code: "MISSING_PHONE" });
  }

  const items = normalizeOrderItems(body.orderItems);
  if (!items.length) throw Object.assign(new Error("الطلب لا يحتوي على أصناف."), { status: 400, code: "EMPTY_ORDER" });

  const total = calculateOrderTotal(items);
  const code = await nextSequence("table_order_number_seq");
  const source = mode === "table" ? "sara_voice" : mode === "dinein" ? "sara_dinein" : "sara_external";
  const language = normalizeLanguage(body.language);

  const inserted = await pool.query(
    `INSERT INTO table_orders (
       order_code, table_number, customer_name, phone, order_mode,
       notes, order_items, order_total_sar, language, source
     ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10)
     RETURNING *`,
    [
      code,
      tableNumber,
      customerName,
      phone,
      mode,
      cleanText(body.notes, 500),
      JSON.stringify(items),
      total,
      language,
      source
    ]
  );

  const row = inserted.rows[0];
  return {
    id: row.id,
    code: row.order_code,
    tableNumber: mode === "table" ? row.table_number : "",
    orderMode: mode,
    customerName: row.customer_name,
    phone: row.phone,
    notes: row.notes,
    orderItems: row.order_items,
    totalSar: Number(row.order_total_sar || 0),
    status: row.status,
    createdAt: row.created_at
  };
}

async function listReservationsForDashboard() {
  if (!pool || !(await ensureSchemaReady())) throw Object.assign(new Error("قاعدة الحجوزات غير جاهزة."), { status: 503 });

  const now = DateTime.now().setZone(env.restaurantTimezone);
  const start = now.startOf("day");
  const end = now.endOf("day");
  const result = await pool.query(
    `SELECT id, confirmation_code, customer_name, phone, party_size, reservation_at,
            notes, staff_notes, order_items, order_total_sar, source, language,
            status, created_at, updated_at
     FROM reservations
     ORDER BY reservation_at ASC`
  );

  const reservations = result.rows.map((row) => {
    const local = DateTime.fromJSDate(new Date(row.reservation_at), { zone: "utc" }).setZone(env.restaurantTimezone);
    let bucket = "archive";
    if (local >= start && local <= end && !["completed", "cancelled"].includes(row.status)) bucket = "today";
    else if (local > end && !["completed", "cancelled"].includes(row.status)) bucket = "upcoming";
    const isLate = local >= start && local < now && !["completed", "cancelled"].includes(row.status);
    return { ...row, bucket, is_late: isLate };
  });

  return { timezone: env.restaurantTimezone, reservations };
}

async function listTableOrdersForDashboard() {
  if (!pool || !(await ensureSchemaReady())) throw Object.assign(new Error("قاعدة الطلبات غير جاهزة."), { status: 503 });

  const now = DateTime.now().setZone(env.restaurantTimezone);
  const start = now.startOf("day");
  const end = now.endOf("day");
  const result = await pool.query(
    `SELECT id, order_code, table_number, customer_name, phone, order_mode,
            notes, staff_notes, order_items, order_total_sar, language, source,
            status, created_at, updated_at
     FROM table_orders
     ORDER BY created_at DESC
     LIMIT 500`
  );

  const orders = result.rows.map((row) => {
    const local = DateTime.fromJSDate(new Date(row.created_at), { zone: "utc" }).setZone(env.restaurantTimezone);
    return { ...row, bucket: local >= start && local <= end ? "today" : "archive" };
  });

  return { timezone: env.restaurantTimezone, day: start.toISODate(), orders };
}

async function updateReservationStatus(id, status) {
  if (!RESERVATION_STATUSES.has(status)) throw Object.assign(new Error("حالة غير صحيحة."), { status: 400 });
  const result = await pool.query(
    "UPDATE reservations SET status=$1, updated_at=NOW() WHERE id=$2 RETURNING id,status",
    [status, id]
  );
  if (!result.rowCount) throw Object.assign(new Error("الحجز غير موجود."), { status: 404 });
  return result.rows[0];
}

async function updateReservationNotes(id, staffNotes) {
  const result = await pool.query(
    "UPDATE reservations SET staff_notes=$1, updated_at=NOW() WHERE id=$2 RETURNING id,staff_notes",
    [cleanText(staffNotes, 1000), id]
  );
  if (!result.rowCount) throw Object.assign(new Error("الحجز غير موجود."), { status: 404 });
  return result.rows[0];
}

async function updateOrderStatus(id, status) {
  if (!ORDER_STATUSES.has(status)) throw Object.assign(new Error("حالة غير صحيحة."), { status: 400 });
  const result = await pool.query(
    "UPDATE table_orders SET status=$1, updated_at=NOW() WHERE id=$2 RETURNING id,status",
    [status, id]
  );
  if (!result.rowCount) throw Object.assign(new Error("الطلب غير موجود."), { status: 404 });
  return result.rows[0];
}

async function updateOrderNotes(id, staffNotes) {
  const result = await pool.query(
    "UPDATE table_orders SET staff_notes=$1, updated_at=NOW() WHERE id=$2 RETURNING id,staff_notes",
    [cleanText(staffNotes, 1000), id]
  );
  if (!result.rowCount) throw Object.assign(new Error("الطلب غير موجود."), { status: 404 });
  return result.rows[0];
}

async function lookupReservation(code) {
  if (!pool) throw Object.assign(new Error("قاعدة البيانات غير مربوطة."), { status: 503, code: "DATABASE_NOT_CONFIGURED" });
  const result = await pool.query(
    `SELECT confirmation_code, customer_name, phone, party_size, reservation_at,
            notes, order_items, order_total_sar, source, status
     FROM reservations
     WHERE confirmation_code=$1
     LIMIT 1`,
    [cleanText(code, 100).toUpperCase()]
  );
  if (!result.rowCount) throw Object.assign(new Error("الحجز غير موجود."), { status: 404, code: "NOT_FOUND" });
  return reservationToPublic(result.rows[0]);
}

module.exports = {
  createReservation,
  createTableOrder,
  listReservationsForDashboard,
  listTableOrdersForDashboard,
  lookupReservation,
  normalizeWhatsAppPhone,
  processDueReservationReminders,
  updateOrderNotes,
  updateOrderStatus,
  updateReservationNotes,
  updateReservationStatus
};
