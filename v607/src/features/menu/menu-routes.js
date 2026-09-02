"use strict";

const express = require("express");
const { pool } = require("../../db/database");
const { getMenu, readCategories } = require("./menu-service");

function createPublicMenuRouter() {
  const router = express.Router();

  router.get("/menu", async (_request, response) => {
    try {
      const [items, categories] = await Promise.all([getMenu(), readCategories()]);
      response.json({ ok: true, managed: Boolean(pool), items, categories });
    } catch (error) {
      console.error("Public menu error:", error);
      response.status(500).json({
        ok: false,
        code: "MENU_LOAD_ERROR",
        message: "تعذر تحميل المنيو."
      });
    }
  });

  router.get("/menu-categories", async (_request, response) => {
    try {
      response.json({ ok: true, categories: await readCategories() });
    } catch (error) {
      console.error("Public categories error:", error);
      response.status(500).json({ ok: false, message: "تعذر تحميل الأقسام." });
    }
  });

  router.get("/menu-images/:id", async (request, response) => {
    try {
      if (!pool) return response.sendStatus(404);
      const result = await pool.query(
        "SELECT mime_type, data FROM menu_images WHERE id=$1",
        [request.params.id]
      );
      if (!result.rowCount) return response.sendStatus(404);

      response.setHeader("Content-Type", result.rows[0].mime_type);
      response.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      return response.send(result.rows[0].data);
    } catch {
      return response.sendStatus(404);
    }
  });

  return router;
}

module.exports = { createPublicMenuRouter };
