"use strict";

const path = require("path");
const express = require("express");
const helmet = require("helmet");
const { rateLimit } = require("express-rate-limit");
const { env } = require("./config/env");
const { pool } = require("./db/database");
const { createPublicMenuRouter } = require("./features/menu/menu-routes");
const { createRestaurantRouter } = require("./features/restaurant/restaurant-routes");
const { createOrdersRouter } = require("./features/orders/orders-routes");
const { createSaraRouter } = require("./features/sara/sara-routes");
const { getRestaurantProfile } = require("./features/restaurant/restaurant-service");

const PUBLIC_DIR = path.join(__dirname, "..", "public");

function createApp() {
  const app = express();
  app.set("trust proxy", 1);
  app.disable("x-powered-by");

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false
    })
  );
  app.use(express.json({ limit: "5mb" }));
  app.use(express.urlencoded({ extended: true, limit: "2mb" }));

  const publicApiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 500,
    standardHeaders: true,
    legacyHeaders: false,
    message: { ok: false, code: "RATE_LIMITED", message: "طلبات كثيرة جدًا. حاول بعد قليل." }
  });
  const aiLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    limit: 180,
    standardHeaders: true,
    legacyHeaders: false,
    message: { ok: false, code: "AI_RATE_LIMITED", message: "تم تجاوز حد استخدام سارة مؤقتًا. حاول بعد قليل." }
  });
  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 12,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    message: { ok: false, code: "LOGIN_RATE_LIMITED", message: "محاولات دخول كثيرة. حاول بعد قليل." }
  });

  // HTML must always be revalidated so a new deploy cannot keep an old UI shell in Safari/Chrome.
  app.get("/", (_request, response) => {
    response.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    response.setHeader("Pragma", "no-cache");
    response.setHeader("Expires", "0");
    response.sendFile(path.join(PUBLIC_DIR, "index.html"));
  });
  app.get(["/restaurant", "/restaurant/", "/restaurant-dashboard", "/restaurant-dashboard/"], (_request, response) => {
    response.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    response.setHeader("Pragma", "no-cache");
    response.setHeader("Expires", "0");
    response.sendFile(path.join(PUBLIC_DIR, "restaurant-dashboard.html"));
  });

  // Do not keep JS/CSS for a full day. Revalidate on every navigation so deploys appear immediately.
  // ETag remains enabled, so unchanged assets can still return a lightweight 304 response.
  app.use(
    "/assets",
    express.static(path.join(PUBLIC_DIR, "assets"), {
      maxAge: 0,
      etag: true,
      setHeaders(response) {
        response.setHeader("Cache-Control", "no-cache, max-age=0, must-revalidate");
      }
    })
  );

  app.use("/api/restaurant/login", loginLimiter);
  app.use(
    [
      "/api/realtime-call",
      "/api/ai",
      "/api/transcribe",
      "/api/tts",
      "/api/cartesia-tts",
      "/api/sara-alt-transcribe",
      "/api/sara-alt-chat",
      "/api/sara-alt-tts"
    ],
    aiLimiter
  );
  app.use("/api", publicApiLimiter);

  app.use("/api", createPublicMenuRouter());
  app.get("/api/restaurant-profile", async (_request, response) => {
    try {
      response.json({ ok: true, profile: await getRestaurantProfile() });
    } catch (error) {
      console.error("Restaurant profile read error:", error);
      response.status(500).json({ ok: false, message: "تعذر تحميل بيانات المطعم." });
    }
  });
  app.use("/api/restaurant", createRestaurantRouter());
  app.use("/api", createOrdersRouter());
  app.use("/api", createSaraRouter());

  app.get("/health", (_request, response) => {
    response.json({
      ok: true,
      service: "Smart Menu AI",
      version: "6.0.8",
      primaryLanguage: "ar",
      currency: "SAR",
      databaseConfigured: Boolean(pool),
      openaiConfigured: Boolean(env.openaiApiKey),
      deepseekConfigured: Boolean(env.deepseekApiKey),
      cartesiaConfigured: Boolean(env.cartesiaApiKey && env.cartesiaVoiceId),
      timestamp: new Date().toISOString()
    });
  });

  app.use("/api", (_request, response) => {
    response.status(404).json({
      ok: false,
      code: "NOT_FOUND",
      message: "API endpoint not found."
    });
  });

  app.use((error, _request, response, _next) => {
    console.error("Unhandled server error:", error);
    response.status(Number(error?.status || 500)).json({
      ok: false,
      code: error?.code || "SERVER_ERROR",
      message: error?.message || "حدث خطأ في السيرفر."
    });
  });

  return app;
}

module.exports = { createApp };
