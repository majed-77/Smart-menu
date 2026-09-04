"use strict";

const { createApp } = require("./src/app");
const { env } = require("./src/config/env");
const { ensureSchemaReady, getSchemaState, pool } = require("./src/db/database");
const { version } = require("./package.json");

async function start() {
  if (pool) {
    const ready = await ensureSchemaReady();
    if (!ready) {
      console.error("❌ قاعدة البيانات غير جاهزة:", getSchemaState().error || "خطأ غير معروف");
      process.exitCode = 1;
      return;
    }
  }

  const app = createApp();
  const server = app.listen(env.port, "0.0.0.0", () => {
    console.log(`✅ Smart Menu AI v${version} يعمل على المنفذ ${env.port}`);
    console.log(`🗃️ PostgreSQL: ${pool ? "جاهز" : "غير مربوط"}`);
    console.log(`🤖 OpenAI: ${env.openaiApiKey ? "مربوط" : "غير مربوط"}`);
    console.log(`🇸🇦 اللغة الأساسية: العربية | العملة: SAR`);
  });

  const shutdown = async (signal) => {
    console.log(`\n${signal}: إيقاف السيرفر بأمان...`);
    server.close(async () => {
      if (pool) await pool.end().catch(() => {});
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.once("SIGTERM", () => shutdown("SIGTERM"));
  process.once("SIGINT", () => shutdown("SIGINT"));
}

start().catch((error) => {
  console.error("Fatal startup error:", error);
  process.exit(1);
});
