"use strict";

const crypto = require("crypto");

function readString(name, fallback = "") {
  return String(process.env[name] ?? fallback).trim();
}

function readInt(name, fallback) {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(value) ? value : fallback;
}

const dashboardPassword = readString("RESTAURANT_DASHBOARD_PASSWORD");

const env = Object.freeze({
  nodeEnv: readString("NODE_ENV", "production"),
  port: readInt("PORT", 3000),
  restaurantTimezone: readString("RESTAURANT_TIMEZONE", "Asia/Riyadh"),

  databaseUrl: readString("DATABASE_URL"),

  openaiApiKey: readString("OPENAI_API_KEY"),
  openaiLlmModel: readString("OPENAI_LLM_MODEL", "gpt-5.4-mini"),
  deepgramApiKey: readString("DEEPGRAM_API_KEY"),
  deepgramSttModel: readString("DEEPGRAM_STT_MODEL", "nova-3"),
  deepgramSttLanguageAr: readString("DEEPGRAM_STT_LANGUAGE_AR", "ar-SA"),
  deepgramTtsModelEn: readString("DEEPGRAM_TTS_MODEL_EN", "aura-2-thalia-en"),
  deepgramTtsModelFr: readString("DEEPGRAM_TTS_MODEL_FR", "aura-2-agathe-fr"),
  deepgramTtsModelAr: readString("DEEPGRAM_TTS_MODEL_AR"),
  cartesiaApiKey: readString("CARTESIA_API_KEY"),
  cartesiaVoiceId: readString("CARTESIA_VOICE_ID", "731ace69-ee17-41bc-8c6f-665c9f1db95c"),
  cartesiaTtsModel: readString("CARTESIA_TTS_MODEL", "sonic-3.6"),
  cartesiaApiVersion: readString("CARTESIA_API_VERSION", "2026-08-14"),
  deepseekApiKey: readString("DEEPSEEK_API_KEY"),
  anthropicApiKey: readString("ANTHROPIC_API_KEY"),
  anthropicWorkspaceId: readString("ANTHROPIC_WORKSPACE_ID"),
  geminiApiKey: readString("GEMINI_API_KEY"),
  kimiApiKey: readString("KIMI_API_KEY") || readString("MOONSHOT_API_KEY"),
  elevenLabsApiKey: readString("ELEVENLABS_API_KEY"),
  fishAudioApiKey: readString("FISH_AUDIO_API_KEY"),

  deepseekModel: readString("DEEPSEEK_MODEL", "deepseek-v4-flash"),
  anthropicModel: readString("ANTHROPIC_MODEL", "claude-haiku-4-5-20251001"),
  geminiModel: readString("GEMINI_MODEL", "gemini-3.6-flash"),
  kimiModel: readString("KIMI_MODEL", "kimi-k2.5"),
  elevenLabsSttModel: readString("ELEVENLABS_STT_MODEL", "scribe_v2"),
  fishAudioVoiceId: readString(
    "FISH_AUDIO_VOICE_ID",
    "384051d27069462aa9b7a021ce541c8f"
  ),
  fishAudioModel: readString("FISH_AUDIO_MODEL", "s2.1-pro-free"),

  twilioAccountSid: readString("TWILIO_ACCOUNT_SID"),
  twilioAuthToken: readString("TWILIO_AUTH_TOKEN"),
  twilioWhatsAppFrom: readString("TWILIO_WHATSAPP_FROM"),
  twilioMessagingServiceSid: readString("TWILIO_MESSAGING_SERVICE_SID"),
  twilioContentSid: readString("TWILIO_CONTENT_SID"),
  twilioTrialContentSid: readString(
    "TWILIO_TRIAL_CONTENT_SID",
    "HXfe5ab5f00277942d4d4200328b4d403c"
  ),
  restaurantWhatsAppTo: readString("RESTAURANT_WHATSAPP_TO"),
  cronSecret: readString("CRON_SECRET"),

  dashboardPassword,
  dashboardSecret:
    readString("RESTAURANT_DASHBOARD_SECRET") ||
    dashboardPassword ||
    crypto.randomBytes(32).toString("hex")
});

module.exports = { env };
