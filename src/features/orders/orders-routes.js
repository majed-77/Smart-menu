"use strict";

const express = require("express");
const { env } = require("../../config/env");
const { getSchemaState, pool, ensureSchemaReady } = require("../../db/database");
const {
  createReservation,
  createTableOrder,
  lookupReservation,
  manageReservationForGuest,
  processDueReservationReminders,
  updateReservationOrder,
  verifyReservationForGuest
} = require("./orders-service");

function sendServiceError(response, error, fallbackCode, fallbackMessage) {
  const status = Number(error?.status || 500);
  if (status >= 500) console.error(fallbackMessage, error);
  response.status(status).json({
    ok: false,
    code: error?.code || fallbackCode,
    message: error?.message || fallbackMessage,
    ...(error?.detail ? { detail: error.detail } : {})
  });
}

function createOrdersRouter() {
  const router = express.Router();

  router.post("/table-orders", async (request, response) => {
    try {
      const order = await createTableOrder(request.body || {});
      response.status(201).json({ ok: true, order });
    } catch (error) {
      sendServiceError(response, error, "ORDER_ERROR", "تعذر حفظ الطلب.");
    }
  });

  router.post("/reservations", async (request, response) => {
    try {
      const result = await createReservation(request.body || {});
      response.status(result.created ? 201 : 200).json({
        ok: true,
        duplicate: result.duplicate,
        restaurantWhatsApp: result.restaurantWhatsApp,
        reservation: result.reservation
      });
    } catch (error) {
      sendServiceError(response, error, "RESERVATION_ERROR", "تعذر حفظ الحجز الآن. حاول مرة أخرى.");
    }
  });

  router.get("/reservations-status", async (_request, response) => {
    if (!pool) {
      return response.status(503).json({
        ok: false,
        database: false,
        message: "DATABASE_URL غير مربوط."
      });
    }

    try {
      const ready = await ensureSchemaReady();
      if (!ready) {
        return response.status(503).json({
          ok: false,
          database: true,
          schema: false,
          message: getSchemaState().error || "قاعدة الحجوزات غير جاهزة."
        });
      }
      const result = await pool.query("SELECT COUNT(*)::int AS count FROM reservations");
      return response.json({
        ok: true,
        database: true,
        schema: true,
        reservations: result.rows[0].count
      });
    } catch (error) {
      console.error("Reservations status error:", error);
      return response.status(500).json({
        ok: false,
        database: false,
        message: "تعذر الاتصال بقاعدة الحجوزات."
      });
    }
  });

  router.get("/reservations/:code", async (request, response) => {
    try {
      response.json({ ok: true, reservation: await lookupReservation(request.params.code) });
    } catch (error) {
      sendServiceError(response, error, "RESERVATION_LOOKUP_ERROR", "تعذر البحث عن الحجز.");
    }
  });

  router.post("/reservations/:code/verify", async (request, response) => {
    try {
      const reservation = await verifyReservationForGuest(request.params.code, request.body?.phone);
      response.json({ ok: true, reservation });
    } catch (error) {
      sendServiceError(response, error, "RESERVATION_VERIFICATION_ERROR", "تعذر التحقق من الحجز.");
    }
  });

  router.patch("/reservations/:code/manage", async (request, response) => {
    try {
      const result = await manageReservationForGuest(request.params.code, request.body || {});
      response.json({ ok: true, ...result });
    } catch (error) {
      sendServiceError(response, error, "RESERVATION_MANAGEMENT_ERROR", "تعذر تعديل الحجز.");
    }
  });

  router.patch("/reservations/:code/order", async (request, response) => {
    try {
      const result = await updateReservationOrder(request.params.code, request.body || {});
      response.json({ ok: true, ...result });
    } catch (error) {
      sendServiceError(response, error, "RESERVATION_ORDER_UPDATE_ERROR", "تعذر تحديث طلب الحجز.");
    }
  });

  router.post("/reminders/run", async (request, response) => {
    const supplied =
      String(request.headers.authorization || "").replace(/^Bearer\s+/i, "") ||
      String(request.headers["x-cron-secret"] || "");
    if (!env.cronSecret || supplied !== env.cronSecret) {
      return response.status(401).json({ ok: false, code: "UNAUTHORIZED" });
    }

    try {
      response.json({ ok: true, ...(await processDueReservationReminders()) });
    } catch (error) {
      console.error("Reminder cron error:", error);
      response.status(500).json({
        ok: false,
        code: "REMINDER_RUN_ERROR",
        message: error?.message || "تعذر تشغيل التذكيرات."
      });
    }
  });

  return router;
}

module.exports = { createOrdersRouter };
