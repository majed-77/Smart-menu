"use strict";

function normalizeOpenAIError(error) {
  const status = Number(error?.status || 500);
  const rawMessage =
    error?.error?.message || error?.message || "OpenAI request failed.";

  let code =
    error?.code || error?.type || error?.error?.code || "OPENAI_ERROR";

  if (status === 401) code = "invalid_api_key";
  if (status === 403 && code === "OPENAI_ERROR") code = "permission_denied";
  if (status === 429 && /quota|billing|credit/i.test(rawMessage)) {
    code = "insufficient_quota";
  }

  return { status, code, message: rawMessage };
}

function sendError(res, status, code, message, extra = undefined) {
  const payload = { ok: false, code, message };
  if (extra && typeof extra === "object") Object.assign(payload, extra);
  return res.status(status).json(payload);
}

module.exports = { normalizeOpenAIError, sendError };
