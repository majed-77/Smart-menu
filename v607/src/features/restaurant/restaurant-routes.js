"use strict";

const crypto = require("crypto");
const express = require("express");
const multer = require("multer");
const { env } = require("../../config/env");
const { pool, ensureSchemaReady } = require("../../db/database");
const {
  clearDashboardCookie,
  requireDashboardAuth,
  setDashboardCookie,
  verifyDashboardPassword
} = require("../../middleware/dashboard-auth");
const {
  getMenu,
  readCategories,
  removeCategory,
  removeMenuItem,
  reorderCategories,
  reorderItems,
  restoreMenuItem,
  saveCategory,
  saveMenuItem
} = require("../menu/menu-service");
const {
  getRestaurantProfile,
  saveRestaurantProfile
} = require("./restaurant-service");
const {
  listReservationsForDashboard,
  listTableOrdersForDashboard,
  updateOrderNotes,
  updateOrderStatus,
  updateReservationNotes,
  updateReservationStatus
} = require("../orders/orders-service");

const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_request, file, callback) => {
    callback(null, ["image/jpeg", "image/png", "image/webp"].includes(file.mimetype));
  }
});

async function saveUploadedImage(file) {
  if (!file) throw Object.assign(new Error("اختر صورة JPG أو PNG أو WebP."), { status: 400 });
  if (!pool || !(await ensureSchemaReady())) {
    throw Object.assign(new Error("قاعدة البيانات غير جاهزة."), { status: 503 });
  }

  const id = crypto.randomUUID();
  await pool.query("INSERT INTO menu_images (id, mime_type, data) VALUES ($1,$2,$3)", [
    id,
    file.mimetype,
    file.buffer
  ]);
  return `/api/menu-images/${id}`;
}

function sendServiceError(response, error, fallbackMessage) {
  const status = Number(error?.status || 500);
  if (status >= 500) console.error(fallbackMessage, error);
  response.status(status).json({
    ok: false,
    code: error?.code || "RESTAURANT_ERROR",
    message: error?.message || fallbackMessage
  });
}

function createRestaurantRouter() {
  const router = express.Router();

  router.post("/login", (request, response) => {
    if (!env.dashboardPassword) {
      return response.status(503).json({
        ok: false,
        message: "أضف RESTAURANT_DASHBOARD_PASSWORD في Render أولًا."
      });
    }
    if (!verifyDashboardPassword(request.body?.password)) {
      return response.status(401).json({ ok: false, message: "كلمة المرور غير صحيحة." });
    }
    setDashboardCookie(response);
    return response.json({ ok: true });
  });

  router.post("/logout", (_request, response) => {
    clearDashboardCookie(response);
    response.json({ ok: true });
  });

  router.use(requireDashboardAuth);

  router.get("/settings", async (_request, response) => {
    try {
      response.json({ ok: true, profile: await getRestaurantProfile() });
    } catch (error) {
      sendServiceError(response, error, "تعذر تحميل إعدادات المطعم.");
    }
  });

  router.post("/settings/image", imageUpload.single("image"), async (request, response) => {
    try {
      response.json({ ok: true, imageUrl: await saveUploadedImage(request.file) });
    } catch (error) {
      sendServiceError(response, error, "تعذر رفع الصورة.");
    }
  });

  router.post("/settings/save", async (request, response) => {
    try {
      const profile = await saveRestaurantProfile(request.body || {});
      response.json({ ok: true, profile });
    } catch (error) {
      sendServiceError(response, error, "تعذر حفظ إعدادات المطعم.");
    }
  });

  router.post("/menu/image", imageUpload.single("image"), async (request, response) => {
    try {
      response.json({ ok: true, imageUrl: await saveUploadedImage(request.file) });
    } catch (error) {
      sendServiceError(response, error, "تعذر رفع الصورة.");
    }
  });

  router.get("/menu/categories", async (_request, response) => {
    try {
      response.json({ ok: true, categories: await readCategories() });
    } catch (error) {
      sendServiceError(response, error, "تعذر تحميل الأقسام.");
    }
  });

  router.post("/menu/categories/save", async (request, response) => {
    try {
      await saveCategory(request.body || {});
      response.json({ ok: true });
    } catch (error) {
      if (error?.code === "23505") error.message = "اسم القسم مستخدم مسبقًا.";
      sendServiceError(response, error, "تعذر حفظ القسم.");
    }
  });

  router.post("/menu/categories/reorder", async (request, response) => {
    try {
      await reorderCategories(request.body?.categories);
      response.json({ ok: true });
    } catch (error) {
      sendServiceError(response, error, "تعذر حفظ ترتيب الأقسام.");
    }
  });

  router.post("/menu/categories/remove", async (request, response) => {
    try {
      await removeCategory(request.body?.id);
      response.json({ ok: true });
    } catch (error) {
      sendServiceError(response, error, "تعذر حذف القسم.");
    }
  });

  router.get("/menu", async (_request, response) => {
    try {
      response.json({ ok: true, items: await getMenu({ includeInactive: true }) });
    } catch (error) {
      sendServiceError(response, error, "تعذر تحميل المنيو.");
    }
  });

  router.post("/menu/save", async (request, response) => {
    try {
      const result = await saveMenuItem(request.body || {});
      response.json({ ok: true, ...result });
    } catch (error) {
      sendServiceError(response, error, "تعذر حفظ الصنف.");
    }
  });

  router.post("/menu/reorder", async (request, response) => {
    try {
      await reorderItems(request.body?.items);
      response.json({ ok: true });
    } catch (error) {
      sendServiceError(response, error, "تعذر حفظ ترتيب الأصناف.");
    }
  });

  router.post("/menu/remove", async (request, response) => {
    try {
      await removeMenuItem(request.body?.itemKey);
      response.json({ ok: true });
    } catch (error) {
      sendServiceError(response, error, "تعذر حذف الصنف.");
    }
  });

  router.post("/menu/restore", async (request, response) => {
    try {
      await restoreMenuItem(request.body?.itemKey);
      response.json({ ok: true });
    } catch (error) {
      sendServiceError(response, error, "تعذر استعادة الصنف.");
    }
  });

  router.get("/reservations", async (_request, response) => {
    try {
      response.json({ ok: true, ...(await listReservationsForDashboard()) });
    } catch (error) {
      sendServiceError(response, error, "تعذر تحميل الحجوزات.");
    }
  });

  router.patch("/reservations/:id/status", async (request, response) => {
    try {
      const reservation = await updateReservationStatus(
        request.params.id,
        String(request.body?.status || "")
      );
      response.json({ ok: true, reservation });
    } catch (error) {
      sendServiceError(response, error, "تعذر تحديث حالة الحجز.");
    }
  });

  router.patch("/reservations/:id/notes", async (request, response) => {
    try {
      const reservation = await updateReservationNotes(
        request.params.id,
        request.body?.staffNotes
      );
      response.json({ ok: true, reservation });
    } catch (error) {
      sendServiceError(response, error, "تعذر حفظ الملاحظة.");
    }
  });

  router.get("/table-orders", async (_request, response) => {
    try {
      response.json({ ok: true, ...(await listTableOrdersForDashboard()) });
    } catch (error) {
      sendServiceError(response, error, "تعذر تحميل الطلبات.");
    }
  });

  router.patch("/table-orders/:id/status", async (request, response) => {
    try {
      const order = await updateOrderStatus(request.params.id, String(request.body?.status || ""));
      response.json({ ok: true, order });
    } catch (error) {
      sendServiceError(response, error, "تعذر تحديث حالة الطلب.");
    }
  });

  router.patch("/table-orders/:id/notes", async (request, response) => {
    try {
      const order = await updateOrderNotes(request.params.id, request.body?.staffNotes);
      response.json({ ok: true, order });
    } catch (error) {
      sendServiceError(response, error, "تعذر حفظ الملاحظة.");
    }
  });

  return router;
}

module.exports = { createRestaurantRouter };
