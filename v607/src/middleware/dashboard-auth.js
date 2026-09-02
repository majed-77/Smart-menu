"use strict";

const crypto = require("crypto");
const { DateTime } = require("luxon");
const { env } = require("../config/env");

const COOKIE_NAME = "restaurant_dashboard";

function parseCookies(request) {
  const result = {};
  for (const part of String(request.headers.cookie || "").split(";")) {
    const separator = part.indexOf("=");
    if (separator <= 0) continue;
    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    try {
      result[key] = decodeURIComponent(value);
    } catch {
      result[key] = value;
    }
  }
  return result;
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function createDashboardToken(date = DateTime.now().setZone(env.restaurantTimezone)) {
  const day = date.toFormat("yyyy-LL-dd");
  return crypto
    .createHmac("sha256", env.dashboardSecret)
    .update(`restaurant-dashboard:${day}`)
    .digest("hex");
}

function verifyDashboardPassword(password) {
  return Boolean(env.dashboardPassword) && safeEqual(password, env.dashboardPassword);
}

function isDashboardAuthenticated(request) {
  if (!env.dashboardPassword) return false;
  const token = parseCookies(request)[COOKIE_NAME];
  return safeEqual(token, createDashboardToken());
}

function requireDashboardAuth(request, response, next) {
  if (!env.dashboardPassword) {
    return response.status(503).json({
      ok: false,
      code: "DASHBOARD_PASSWORD_NOT_CONFIGURED",
      message: "أضف RESTAURANT_DASHBOARD_PASSWORD في Render أولًا."
    });
  }

  if (!isDashboardAuthenticated(request)) {
    return response.status(401).json({
      ok: false,
      code: "DASHBOARD_AUTH_REQUIRED",
      message: "يرجى تسجيل الدخول."
    });
  }

  return next();
}

function setDashboardCookie(response) {
  response.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=${createDashboardToken()}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=86400`
  );
}

function clearDashboardCookie(response) {
  response.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`
  );
}

module.exports = {
  clearDashboardCookie,
  isDashboardAuthenticated,
  requireDashboardAuth,
  setDashboardCookie,
  verifyDashboardPassword
};
