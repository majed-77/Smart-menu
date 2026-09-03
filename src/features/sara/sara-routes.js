"use strict";

const express = require("express");
const multer = require("multer");
const OpenAI = require("openai");
const { DateTime } = require("luxon");
const { env } = require("../../config/env");
const { normalizeOpenAIError } = require("../../lib/errors");
const { getRestaurantProfile } = require("../restaurant/restaurant-service");

const router = express.Router();
const apiKey = env.openaiApiKey;
const openai = apiKey ? new OpenAI({ apiKey }) : null;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }
});

router.get("/diagnostics", async (req, res) => {
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
// ======================================================
// SPEECH TO TEXT
// ======================================================
function looksLikeArabicSttHallucination(text) {
  const raw = String(text || "").trim();
  if (!raw) return false;

  const arabicLetters = (raw.match(/[\u0600-\u06FF]/g) || []).length;
  const letterTokens = raw.match(/\p{L}+/gu) || [];
  const normalized = raw.toLowerCase().replace(/[.,!?;:'"()[\]{}]/g, " ").replace(/\s+/g, " ").trim();

  // Arabic mode may legitimately contain one foreign menu/product name, numbers,
  // or a mixed Arabic sentence. A multi-word transcript with no Arabic letters is
  // usually a translated/wrong-script STT result and must be retried before display.
  if (arabicLetters === 0 && letterTokens.length >= 2) return true;
  if (arabicLetters > 0) return false;

  // Common meta/assistant hallucinations produced from weak/noisy Arabic audio.
  if (/\b(i should|i need|i would|i can|you should|we should|should ask|need to ask|thank you|thanks for|hello there)\b/.test(normalized)) return true;
  return false;
}

router.post("/transcribe", upload.single("audio"), async (req, res) => {
  try {
    const transcribeMode = String(req.body?.mode || "");
    const useDeepgramStt = transcribeMode === "deepgram-stt";

    if (useDeepgramStt && !env.deepgramApiKey) {
      return res.status(401).json({
        ok: false,
        code: "DEEPGRAM_NOT_CONFIGURED",
        message: "مفتاح Deepgram غير موجود في إعدادات السيرفر."
      });
    }

    if (!useDeepgramStt && !apiKey) {
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
    const mime = req.file.mimetype || "audio/webm";

    // The retained Sara engine uses Deepgram STT for French/English. Arabic is pinned to
    // Saudi Arabic (ar-SA) so the speech recognizer is evaluated on the dialect
    // we actually need in the restaurant instead of generic Arabic.
    if (useDeepgramStt) {
      const deepgramLanguage = language === "ar"
        ? env.deepgramSttLanguageAr
        : language === "fr" ? "fr" : "en";
      const url = new URL("https://api.deepgram.com/v1/listen");
      url.searchParams.set("model", env.deepgramSttModel);
      url.searchParams.set("language", deepgramLanguage);
      url.searchParams.set("smart_format", "true");
      // Nova-3 keyterm prompting improves recall of short restaurant phrases
      // that are especially important in Saudi Arabic confirmations/changes.
      if (language === "ar") {
        [
          "اعتمد", "نعم", "ايه", "إيه", "تمام", "بدون", "زيادة",
          "حجز", "طاولة", "طلب", "واتساب", "رقم الجوال", "الساعة"
        ].forEach((term) => url.searchParams.append("keyterm", term));
      }

      const dgResponse = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Token ${env.deepgramApiKey}`,
          "Content-Type": mime
        },
        body: req.file.buffer
      });

      const dgPayload = await dgResponse.json().catch(() => null);
      if (!dgResponse.ok) {
        const detail = dgPayload?.err_msg || dgPayload?.message || `Deepgram STT HTTP ${dgResponse.status}`;
        console.error("Deepgram STT error:", detail);
        return res.status(502).json({
          ok: false,
          code: "DEEPGRAM_STT_ERROR",
          message: "تعذر فهم الصوت حاليًا، حاول مرة ثانية."
        });
      }

      const text = String(
        dgPayload?.results?.channels?.[0]?.alternatives?.[0]?.transcript || ""
      ).trim();

      if (!text) {
        return res.status(422).json({
          ok: false,
          code: "NO_SPEECH_DETECTED",
          message: language === "fr"
            ? "Aucune parole claire détectée."
            : language === "en"
            ? "No clear speech was detected."
            : "ما التقطت كلام واضح، حاول تقول الجملة مرة ثانية."
        });
      }

      // Keep the existing Arabic safety net for obviously corrupted short
      // transcripts, while allowing real foreign menu names in Arabic speech.
      if (language === "ar" && looksLikeArabicSttHallucination(text)) {
        return res.status(422).json({
          ok: false,
          code: "UNCERTAIN_ARABIC_TRANSCRIPT",
          message: "ما التقطت كلام واضح، حاول تقول الجملة مرة ثانية."
        });
      }

      res.setHeader("X-Sara-STT-Provider", "deepgram");
      res.setHeader("X-Sara-STT-Model", env.deepgramSttModel);
      return res.json({ ok: true, text });
    }

    let filename = "speech.webm";

    if (mime.includes("mp4")) filename = "speech.m4a";
    else if (mime.includes("mpeg")) filename = "speech.mp3";
    else if (mime.includes("wav")) filename = "speech.wav";
    else if (mime.includes("ogg")) filename = "speech.ogg";

    const audioFile = new File(
      [req.file.buffer],
      filename,
      { type: mime }
    );

    // Sara favors transcription accuracy for very short Arabic
    // confirmations ("إيه", "نعم", "اعتمد"). Do not seed vocabulary prompts,
    // because prompts previously caused hallucinated approval phrases.
    const isSaraEngine = req.body.mode === "sara";
    const options = {
      file: audioFile,
      model: isSaraEngine ? "gpt-4o-transcribe" : "gpt-4o-mini-transcribe",
      ...(isSaraEngine && language === "ar" ? {
        prompt: "محادثة طبيعية باللهجة السعودية داخل مطعم. اكتب الكلام المسموع بالعربية وبالحروف العربية فقط. لا تترجم إلى أي لغة أخرى، ولا تكتب العربية بحروف لاتينية. اترك أسماء المنتجات الأجنبية فقط كما نطقها العميل."
      } : {})
    };

    if (["ar", "fr", "en"].includes(language)) {
      options.language = language;
    }

    const transcription =
      await openai.audio.transcriptions.create(options);

    let text = String(transcription.text || "").trim();

    // If Arabic audio produced a tiny Latin/meta hallucination, retry the SAME
    // audio once instead of immediately bothering the guest with "I didn't hear you".
    // The retry uses temperature 0 and a generic Saudi-Arabic context hint only;
    // it intentionally contains no booking/approval vocabulary so it cannot seed
    // fake confirmation words.
    if (isSaraEngine && language === "ar" && looksLikeArabicSttHallucination(text)) {
      console.warn("Suspicious Arabic STT transcript; retrying once:", text);
      try {
        const retryOptions = {
          file: audioFile,
          model: "gpt-4o-transcribe",
          language: "ar",
          temperature: 0,
          prompt: "محادثة طبيعية بالعربية السعودية داخل مطعم. اكتب فقط الكلام المسموع بوضوح، ولا تترجم ولا تضف شرحاً."
        };
        const retry = await openai.audio.transcriptions.create(retryOptions);
        const retryText = String(retry.text || "").trim();
        if (retryText && !looksLikeArabicSttHallucination(retryText)) {
          text = retryText;
        } else {
          console.warn("Arabic STT retry still uncertain:", retryText || text);
        }
      } catch (retryErr) {
        console.warn("Arabic STT retry failed:", retryErr?.message || retryErr);
      }
    }

    if (isSaraEngine && language === "ar" && looksLikeArabicSttHallucination(text)) {
      return res.status(422).json({
        ok: false,
        code: "UNCERTAIN_ARABIC_TRANSCRIPT",
        message: "ما التقطت كلام واضح، حاول تقول الجملة مرة ثانية."
      });
    }

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
// Keep the visible chat text untouched, but give Arabic TTS a pronunciation-
// optimized copy. This avoids common ambiguous readings in booking phrases.
function prepareCartesiaTranscript(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

const saraTtsCache = new Map();
function getSaraTtsCache(key){
  const hit=saraTtsCache.get(key);
  if(!hit)return null;
  // Refresh insertion order for a tiny LRU cache.
  saraTtsCache.delete(key); saraTtsCache.set(key,hit);
  return hit;
}
function setSaraTtsCache(key,buffer){
  saraTtsCache.set(key,buffer);
  while(saraTtsCache.size>40){
    const oldest=saraTtsCache.keys().next().value; saraTtsCache.delete(oldest);
  }
}

// ======================================================
// DEEPGRAM STT + OPENAI LLM + CARTESIA TTS
// Voice chosen by the restaurant owner; Cartesia key stays server-side.
// ======================================================
router.post("/cartesia-tts", async (req, res) => {
  try {
    const { text, language = "ar" } = req.body || {};
    const cleanText = String(text || "").trim();
    if (!cleanText) {
      return res.status(400).json({ ok:false, code:"EMPTY_TEXT", message:"لا يوجد نص لتحويله إلى صوت." });
    }
    if (!env.cartesiaApiKey) {
      return res.status(401).json({ ok:false, code:"CARTESIA_NOT_CONFIGURED", message:"CARTESIA_API_KEY غير موجود في Render." });
    }
    if (!env.cartesiaVoiceId) {
      return res.status(409).json({ ok:false, code:"CARTESIA_VOICE_NOT_CONFIGURED", message:"CARTESIA_VOICE_ID غير مضبوط." });
    }

    // For the selected Arabic voice, do not force the generic `ar` language
    // override. Cartesia accepts language as optional; letting the voice/model
    // infer Arabic preserves the voice's own locale/accent conditioning, which
    // is closer to Playground behavior for this Saudi-sounding voice.
    const cartesiaLanguage = language === "ar" ? "ar" : language === "fr" ? "fr" : "en";
    const makeCartesiaRequest = (useKhaleejiAccent) => fetch("https://api.cartesia.ai/tts/bytes", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.cartesiaApiKey}`,
        "Cartesia-Version": env.cartesiaApiVersion,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model_id: env.cartesiaTtsModel,
        transcript: prepareCartesiaTranscript(cleanText),
        voice: { mode: "id", id: env.cartesiaVoiceId },
        output_format: { container: "wav", encoding: "pcm_s16le", sample_rate: 44100 },
        language: cartesiaLanguage,
        ...(language === "ar" && useKhaleejiAccent ? { accent: "khaleeji" } : {}),
        generation_config: { volume: 1, speed: language === "ar" ? 0.97 : 1 }
      })
    });

    // Arabic is explicitly requested as Khaleeji. If this specific voice/model
    // rejects accent conditioning, retry the same Fatima voice without accent
    // rather than falling back to an OpenAI Arabic voice.
    let response = await makeCartesiaRequest(language === "ar");
    if (!response.ok && language === "ar") {
      const firstDetail = await response.text().catch(() => "");
      console.warn("Cartesia khaleeji accent rejected; retrying Fatima without accent:", response.status, firstDetail.slice(0, 300));
      response = await makeCartesiaRequest(false);
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.error("Cartesia TTS HTTP error:", response.status, detail.slice(0, 500));
      return res.status(502).json({
        ok:false,
        code:"CARTESIA_TTS_ERROR",
        message:"تعذر تشغيل صوت سارة مؤقتًا."
      });
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length) throw new Error("Cartesia returned empty audio.");

    res.setHeader("Content-Type", response.headers.get("content-type") || "audio/wav");
    res.setHeader("Content-Length", buffer.length);
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Sara-TTS-Provider", "cartesia");
    return res.send(buffer);
  } catch (error) {
    console.error("Cartesia TTS error:", error);
    return res.status(502).json({ ok:false, code:"CARTESIA_TTS_ERROR", message:"تعذر تشغيل صوت سارة مؤقتًا." });
  }
});


// ======================================================
function saraInstructions({ language = "ar", menu = [], tableNumber = "", restaurantName = "المطعم" } = {}) {
  const today = DateTime.now().setZone(env.restaurantTimezone).toISODate();
  const languageRule = language === "fr"
    ? "Speak only natural, warm conversational French."
    : language === "en"
    ? "Speak only natural, warm conversational English."
    : "تكلمي فقط باللهجة السعودية البيضاء الطبيعية وبنفس اللهجة من أول المحادثة لآخرها، بميل نجدي خفيف. اكتبي الرد كما يُنطق سعوديًا لأن النص سيذهب مباشرة لمحرك صوت: هلا والله، حياك، أبشر، وش ودك، تبي، ودك، تمام، من عيوني، خلاص، ما عليه، أقدر، عندنا. لا تستخدمي الصياغات الفصحى مثل: ماذا تريد، هل ترغب، بالطبع، حسنًا، يمكنني مساعدتك، أود أن. لا تغيّرين اللهجة بين الردود. ممنوع كلمات ولهجات مصرية أو شامية أو تونسية أو خليجية غير سعودية مثل: شو، عايز، عاوز، برشا، بزاف، وايد، شلون. تجنبي الفصحى الرسمية إلا لضرورة توضيح معلومة دقيقة.";

  return `Your name is Sara. You are the voice waitress for ${restaurantName}.
Today in the restaurant timezone (${env.restaurantTimezone}) is ${today}.
${languageRule}

IDENTITY / ROLE — ABSOLUTE RULES:
- You are always Sara, the waitress. The guest is never Sara.
- Never rewrite the guest's request as if you were the guest.
- Never answer with planning/meta text such as "I should ask", "I need to ask", "I should respond", or hidden reasoning.
- Reply only with the exact words Sara should say to the guest, or call the booking tool when appropriate.
- In Arabic mode, your visible reply must be Arabic except for unavoidable menu/product names. Do not switch to English, Portuguese, Turkish, French, or any other language.
- If the guest says they want a booking and provides some details, remember those details. Keep behaving like an intelligent waitress: answer any question they ask, handle menu questions or changes naturally, and continue the booking only when it makes conversational sense. Do not turn the conversation into a rigid questionnaire.

MENU AND SERVICE:
- You know the supplied menu and should use only its data for items, descriptions and prices.
- Never recommend or confirm an item marked available=false. Say it is currently unavailable and suggest an available alternative.
- Never invent an item, ingredient, allergen, price or availability.
- Arabic "ليش" and "ليه" always mean "why". They are never Latte, coffee, or any menu item. Answer the reason for the preceding question.
- A vague phrase such as "شي ثاني", "شيء ثاني", or "حاجة ثانية" does not identify an item. Ask which exact item the guest wants and never invent one.
- For Arabic guests, menu prices are already prepared for display in Saudi riyals. Say prices naturally as "26 ريال" and never mention TND/DT.
- Keep normal replies very short and conversational, usually 1-2 sentences. Answer directly and avoid unnecessary setup so speech can start faster.
- For ordinary questions, aim for roughly 30 spoken words or fewer unless the guest explicitly asks for details.
- Sound like a real waitress, not a chatbot, and never mention APIs/models/providers.

TABLE SERVICE MODE:
${tableNumber ? `- The guest opened the menu from the QR code for TABLE ${tableNumber}. They are already seated in the restaurant.
- For a normal food/drink order, do NOT ask for name, phone, date, time, or party size.
- Collect the menu items, quantities, item-specific modifications, and any general order note.
- Before sending, summarize the table order briefly and ask for explicit confirmation.
- Only after explicit confirmation, call confirm_table_order with order_mode="table". The table number is already known by the website.
- Keep every modification attached to the exact item in special_request, e.g. Burger Classique (بدون مايونيز). Never move it to general notes.
- Do not use confirm_booking_order for a seated-table order unless the guest separately asks to make a future reservation.` : `- No table QR is active. The guest came through the normal menu link.
- The guest has three services: dine-in ordering, external pickup, or table reservation.
- ORDER INTENT LOCK: when the guest says "أبي أطلب", "أبغى أطلب", "ودي أطلب", "أبي أوردر", or otherwise clearly starts an order, enter the ORDER flow immediately. Ask only: "أبشر، تبي طلبك هنا بالمطعم ولا استلام خارجي؟"
- Never answer an order-intent phrase by offering "أكل أو مشروب أو حجز طاولة". Food/drink is item type, dine-in/pickup is fulfillment, and booking is a separate service.
- Once the order flow starts, keep it active until the order is sent or the guest explicitly cancels/switches. Do not offer table reservation again unless the guest explicitly asks to reserve.
- ACTIVE BOOKING OVERRIDES SERVICE SELECTION: if the website bookingState or recent conversation shows an unfinished reservation, that reservation is the primary context. Any food/drink the guest adds defaults to a PRE-ORDER ATTACHED TO THAT SAME RESERVATION.
- While a reservation is active, NEVER ask "تبيه هنا بالمطعم ولا استلام خارجي؟" just because the guest mentions food or drinks. Ask service type only when there is no active reservation context.
- Treat a food/drink request during an active reservation as a separate dine-in/pickup order ONLY if the guest explicitly says it is separate, pickup, takeaway, not with the booking, or equivalent wording such as "طلب منفصل", "هذا استلام", "مو مع الحجز", or "غير الحجز".
- If a reservation is active and the guest adds/removes/changes food or drinks, use update_booking_preorder to persist the COMPLETE latest pre-order item list in booking memory. Do not call confirm_table_order for those items.
- If they choose to eat/drink inside the restaurant when no reservation is active: use order_mode="dinein". Collect items, quantities, item-specific modifications, and customer name for identification. Phone is optional. Do NOT ask for a booking date/time or party size unless they separately ask to reserve a table.
- If they choose pickup/takeaway when no reservation is active: use order_mode="external". Collect items, quantities, item-specific modifications, customer name, and mobile/WhatsApp number.
- If they explicitly ask only to reserve a table: use the booking flow below. Food/drink they later add while that reservation remains active becomes its optional pre-order by default.
- Before any food/drink order is sent, summarize it briefly and ask for explicit confirmation. Only after approval call confirm_table_order.
- Never ask for approval until all service-required identification is collected: dine-in requires customer name; external pickup requires customer name and mobile number. A QR table order requires neither.
- Keep every addition/removal/modification attached to the exact item in special_request, e.g. Burger Classique (بدون مايونيز), Latte (حليب شوفان). Never put item-specific changes in general notes.`}

BOOKING + OPTIONAL PRE-ORDER:
- You can collect name, WhatsApp phone, party size, date, time, notes, and optional menu items/quantities/modifications.
- Preserve phone digit order exactly. Saudi local 05xxxxxxxx may be normalized to +9665xxxxxxxx.
- bookingState is memory, not a dialogue script. Never force the guest through a fixed sequence. The guest may ask about food, prices, ingredients, recommendations, availability, add/remove pre-order items, or change a booking detail at any point; answer naturally, then continue from the remembered booking context when appropriate.
- ACTIVE CONTEXT PRIORITY: once a reservation has started and is not yet confirmed/cancelled, preserve that context across topic switches. A menu question does not end the reservation. A food/drink addition becomes a pre-order on that reservation unless the guest explicitly requests a separate order.
- When the guest adds/removes/modifies pre-order items, persist the complete latest list with update_booking_preorder so it survives later turns. Never silently forget earlier pre-order items.
- Never ask again for information already known. If booking details are missing, ask for only one useful missing detail when it is natural to continue the reservation.
- Before saving, summarize the booking/order and ask for explicit confirmation.
- IMPORTANT VOICE STYLE FOR BOOKING CONFIRMATION: speak the summary as one short natural sentence, never as a form, checklist, table, or Markdown list. Do not use Markdown symbols such as **, #, -, bullets, or labels like "الاسم:" and "رقم الواتساب:" in spoken replies.
- In Arabic, the final confirmation MUST include the guest name, WhatsApp/mobile number, booking date/day, exact time, and party size so the guest can verify them. Example: "تمام محمد، أتأكد معك: رقم الجوال 05xxxxxxxx، حجزك اليوم الساعة 22:00 لشخصين، وبدون طلب مسبق. البيانات صحيحة وأعتمد الحجز؟"
- Always read the WhatsApp/mobile number back in the final confirmation. Preserve every digit exactly; never invent, regroup, or omit digits.
- When bookingState contains a time, preserve that exact HH:MM value. Never reinterpret 10:20 as "twenty minutes after ten" or change its minutes. The website may format it separately for display and speech.
- Keep the final confirmation summary to one or two short sentences.
- NEVER call confirm_booking_order until the guest clearly confirms.
- CRITICAL INTERRUPTION RULE: if you were summarizing and the guest interrupts with a clear approval such as "تمام اعتمدي", "اعتمدي الحجز", "نعم اعتمدي", "إيه اعتمدي" or an equivalent, call confirm_booking_order immediately using the latest agreed details. Do not repeat the summary and do not ask for confirmation again.
- If the interruption changes a detail instead of confirming, update it and ask for confirmation again.
- When calling the tool, date must be YYYY-MM-DD and time HH:mm (24-hour).

MENU DATA:
${JSON.stringify(menu)}`;
}

const confirmBookingOrderTool = {
  type: "function",
  function: {
    name: "confirm_booking_order",
    description: "Save the booking and optional pre-order only after the guest has explicitly confirmed the latest summary.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        name: { type: "string" },
        phone: { type: "string" },
        party_size: { type: "integer", minimum: 1, maximum: 30 },
        date: { type: "string", description: "YYYY-MM-DD" },
        time: { type: "string", description: "HH:mm in restaurant local time" },
        notes: { type: "string" },
        order_items: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              item_name: { type: "string" },
              quantity: { type: "integer", minimum: 1, maximum: 20 },
              special_request: { type: "string", description: "Modification for this exact item only, such as بدون خس. Keep it attached to the item." }
            },
            required: ["item_name", "quantity", "special_request"]
          }
        }
      },
      required: ["name", "phone", "party_size", "date", "time", "notes", "order_items"]
    }
  }
};

const updateBookingPreorderTool = {
  type: "function",
  function: {
    name: "update_booking_preorder",
    description: "Update the draft food/drink pre-order attached to an ACTIVE unfinished table reservation. Use this instead of asking dine-in vs pickup when the guest adds/removes/modifies food during a reservation. Send the COMPLETE latest pre-order list after applying the guest's change, plus the short natural sentence Sara should say.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        order_items: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              item_name: { type: "string" },
              quantity: { type: "integer", minimum: 1, maximum: 20 },
              special_request: { type: "string", description: "Modification for this exact item only, e.g. بدون خس" }
            },
            required: ["item_name", "quantity", "special_request"]
          }
        },
        response_message: { type: "string", description: "A short natural reply Sara should say after saving the draft pre-order. Do not ask dine-in/pickup while the booking is active." }
      },
      required: ["order_items", "response_message"]
    }
  }
};

const confirmTableOrderTool = {
  type: "function",
  function: {
    name: "confirm_table_order",
    description: "Send a food/drink order after explicit confirmation. order_mode is table for a QR table order, dinein for a normal-link guest who will eat/drink inside the restaurant, or external for pickup/takeaway.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        order_mode: { type: "string", enum: ["table","dinein","external"], description: "table = QR table, dinein = eat/drink inside restaurant without table QR, external = pickup/takeaway" },
        customer_name: { type: "string", description: "Customer name for dinein/external orders; empty string for a QR table order" },
        phone: { type: "string", description: "Required for external pickup, optional for dinein, empty for a QR table order" },
        notes: { type: "string", description: "General order note only. Never put item-specific modifications here." },
        order_items: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              item_name: { type: "string" },
              quantity: { type: "integer", minimum: 1, maximum: 20 },
              special_request: { type: "string", description: "Modification for this exact item only, e.g. بدون خس" }
            },
            required: ["item_name", "quantity", "special_request"]
          }
        }
      },
      required: ["order_mode", "customer_name", "phone", "notes", "order_items"]
    }
  }
};


function brainToolResult(call) {
  if (!call) return null;
  return { id:call.id || `brain_${Date.now()}`, name:call.name || "confirm_booking_order", arguments:typeof call.arguments === "string" ? call.arguments : JSON.stringify(call.arguments || {}) };
}

async function callOpenAICompatibleBrain({ endpoint, apiKey, model, messages, extraBody = {}, strictTools = true }) {
  const baseBody = { model, messages, tools:[confirmBookingOrderTool,confirmTableOrderTool,updateBookingPreorderTool].map(t=>strictTools?t:{...t,function:{...t.function,strict:undefined}}), tool_choice:"auto" };
  if (!Object.prototype.hasOwnProperty.call(extraBody, "max_completion_tokens")) baseBody.max_tokens = 160;
  if (!/api\.openai\.com/.test(endpoint)) baseBody.temperature = 0.25;
  const response = await fetch(endpoint, {
    method:"POST",
    headers:{ Authorization:`Bearer ${apiKey}`, "Content-Type":"application/json" },
    body:JSON.stringify({ ...baseBody, ...extraBody })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message || data?.message || `AI HTTP ${response.status}`);
  const message = data?.choices?.[0]?.message || {};
  const call = Array.isArray(message.tool_calls) ? message.tool_calls.find(x => ["confirm_booking_order","confirm_table_order","update_booking_preorder"].includes(x?.function?.name)) : null;
  if (call) return { toolCall:brainToolResult({ id:call.id, name:call.function?.name, arguments:call.function?.arguments }) };
  return { answer:String(message.content || "").trim() };
}

router.post("/sara-chat", async (req, res) => {
  try {
    const { question = "", history = [], menu = [], language = "ar", greeting = false, bookingState = null, orderState = null, tableNumber = "" } = req.body || {};
    if (!env.openaiApiKey) {
      return res.status(401).json({ ok:false, code:"OPENAI_NOT_CONFIGURED", message:"مفتاح OpenAI غير موجود في Render." });
    }

    const q = String(question || "").trim();
    if (!q && !greeting) return res.status(400).json({ ok:false, code:"EMPTY_MESSAGE", message:"لا يوجد كلام لإرساله إلى سارة." });

    const cleanHistory = Array.isArray(history) ? history.slice(-12).map(m => ({
      role: m?.role === "assistant" ? "assistant" : "user",
      content: String(m?.content || m?.text || "").trim()
    })).filter(m => m.content) : [];

    const restaurantProfile = await getRestaurantProfile();
    const restaurantNameForSara = language === "fr"
      ? (restaurantProfile.nameFr || restaurantProfile.nameAr)
      : language === "en"
      ? (restaurantProfile.nameEn || restaurantProfile.nameAr)
      : restaurantProfile.nameAr;

    const system = saraInstructions({ language, menu, tableNumber:String(tableNumber||""), restaurantName:restaurantNameForSara })
      + (bookingState && typeof bookingState === "object" ? `\n\nKNOWN BOOKING STATE FROM THE WEBSITE (authoritative):\n${JSON.stringify(bookingState)}
BOOKING MEMORY / AI BEHAVIOR RULES:
- This state is authoritative memory, not a mandatory conversation flow. Remember known facts and answer the guest naturally.
- If this state contains booking facts or the conversation started a reservation, keep it active until confirmed or cancelled.
- While a reservation is active, food/drink additions are a pre-order on that reservation by default.
- Preserve all existing orderItems when adding or modifying an item.
- Never ask again for a field already present in this state.
- The guest may interrupt with any menu question. Answer it first, then continue naturally from remembered state.
- Extract booking details in any order and ask for only one useful missing field.
- If one detail changes, replace only it and preserve everything else.
- Before approval, confirm name, exact phone, date/day, exact HH:MM time, and party size.
- When the guest confirms, fill tool arguments from this state.` : "")
      + (orderState && typeof orderState === "object" ? `\n\nKNOWN ORDER STATE FROM THE WEBSITE (authoritative):\n${JSON.stringify(orderState)}
ORDER MEMORY / AI BEHAVIOR RULES:
- Preserve the known order mode, customer name, phone, notes, and every order item across turns.
- If awaitingField is customerName, ask only for the guest name. If it is phone, ask only for the mobile number. If it is orderMode, ask dine-in or pickup.
- Dine-in requires customerName before approval. External pickup requires customerName and phone before approval. QR table mode requires neither.
- Never summarize for approval and never call confirm_table_order while a required field is missing.
- When the guest supplies a previously missing field, preserve all items, summarize the complete order again, and request fresh approval before calling confirm_table_order.
- Never treat "ليش" or "ليه" as an order item. Never treat "شي ثاني" as an item without clarification.
- Fill confirm_table_order from this authoritative state plus the latest clearly stated changes.` : "");

    const userText = greeting
      ? (language === "ar"
        ? `ابدئي الآن بالترحيب فقط: هلا والله، حياك في ${restaurantNameForSara}، معك سارة، كيف أقدر أخدمك؟`
        : language === "fr"
        ? "Accueille brièvement le client et demande comment tu peux l'aider."
        : "Give a very brief welcome and ask how you can help.")
      : q;

    const messages = [{role:"system",content:system}, ...cleanHistory, {role:"user",content:userText}];
    const result = await callOpenAICompatibleBrain({
      endpoint:"https://api.openai.com/v1/chat/completions",
      apiKey:env.openaiApiKey,
      model:env.openaiLlmModel,
      messages,
      extraBody:{max_completion_tokens:320},
      strictTools:true
    });

    if (result?.toolCall) return res.json({ ok:true, toolCall:result.toolCall });
    const answer = String(result?.answer || "").trim();
    if (!answer) return res.status(502).json({ ok:false, code:"EMPTY_AI_RESPONSE", message:"لم تصل إجابة من سارة." });
    return res.json({ ok:true, answer, provider:"openai" });
  } catch (error) {
    console.error("Sara brain error:", error);
    return res.status(502).json({ ok:false, code:"SARA_BRAIN_ERROR", message:error?.message || "تعذر تشغيل عقل سارة." });
  }
});

function createSaraRouter() {
  return router;
}

module.exports = { createSaraRouter };
