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
// REALTIME VOICE — WebRTC proxy
// Browser sends SDP; API key stays on Render.
// ======================================================
router.post("/realtime-call", async (req, res) => {
  try {
    const { sdp, language = "ar", instructions = "" } = req.body || {};

    if (!apiKey) {
      return res.status(401).json({
        ok: false,
        code: "invalid_api_key",
        message: "مفتاح OpenAI غير موجود."
      });
    }

    if (!sdp) {
      return res.status(400).json({
        ok: false,
        code: "NO_SDP",
        message: "WebRTC SDP is required."
      });
    }

    const session = {
      type: "realtime",
      model: "gpt-realtime-1.5",
      instructions: String(instructions || "") + `\n\nوقت المطعم الحالي: ${DateTime.now().setZone(env.restaurantTimezone).toFormat("yyyy-LL-dd HH:mm")} (${env.restaurantTimezone}). استخدمي هذا الوقت لفهم كلمات مثل اليوم وبكرة وبعد بكرة.`,
      output_modalities: ["audio"],
      tools: [
        {
          type: "function",
          name: "confirm_booking_order",
          description: "Save a table reservation and optional food/drink pre-order only after the guest explicitly confirms the final summary.",
          parameters: {
            type: "object",
            additionalProperties: false,
            properties: {
              name: { type: "string", description: "Guest name" },
              phone: { type: "string", description: "WhatsApp phone in international format starting with +" },
              party_size: { type: "integer", minimum: 1, maximum: 30 },
              date: { type: "string", description: "Reservation date YYYY-MM-DD" },
              time: { type: "string", description: "Reservation time HH:MM 24-hour" },
              notes: { type: "string", description: "Reservation-level notes, empty string if none" },
              order_items: {
                type: "array",
                maxItems: 30,
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    item_name: { type: "string", description: "Menu item name exactly as shown in the current language" },
                    quantity: { type: "integer", minimum: 1, maximum: 20 },
                    special_request: { type: "string", description: "Any modification tied to THIS item only (e.g. بدون خس، بدون بصل، الصوص على جنب). Never put item modifications in general booking notes. Empty string if none." }
                  },
                  required: ["item_name", "quantity", "special_request"]
                }
              }
            },
            required: ["name", "phone", "party_size", "date", "time", "notes", "order_items"]
          }
        },
        {
          type: "function",
          name: "confirm_table_order",
          description: "Send a food/drink order after explicit confirmation. order_mode is table for a QR table order, dinein for a normal-link guest who will eat/drink inside the restaurant, or external for pickup/takeaway.",
          parameters: {
            type: "object", additionalProperties: false,
            properties: {
              order_mode: { type: "string", enum:["table","dinein","external"] },
              customer_name: { type: "string" },
              phone: { type: "string" },
              notes: { type: "string" },
              order_items: { type: "array", minItems: 1, items: { type: "object", additionalProperties: false, properties: { item_name:{type:"string"}, quantity:{type:"integer",minimum:1,maximum:20}, special_request:{type:"string",description:"Item-specific change only, e.g. بدون مايونيز"} }, required:["item_name","quantity","special_request"] } }
            },
            required:["order_mode","customer_name","phone","notes","order_items"]
          }
        }
      ],
      tool_choice: "auto",
      // Audio responses consume many more tokens than plain text.
      // A low cap can stop Sara mid-sentence, so keep a generous budget.
      max_output_tokens: 1200,
      audio: {
        input: {
          turn_detection: {
            type: "server_vad",
            // Less sensitive to speaker echo / café background noise.
            // Real speech still interrupts Sara, but brief noise should not.
            threshold: 0.85,
            prefix_padding_ms: 420,
            silence_duration_ms: 950,
            create_response: false,
            interrupt_response: false
          },
          transcription: {
            model: "gpt-4o-mini-transcribe",
            language: ["ar", "fr", "en"].includes(language) ? language : undefined
          }
        },
        output: {
          voice: "coral"
        }
      }
    };

    // Call the official Realtime WebRTC endpoint directly.
    // This avoids depending on a particular OpenAI Node SDK version.
    // IMPORTANT: OpenAI expects these multipart parts as normal form fields
    // with explicit content types, not as file uploads with filenames.
    // Node's FormData + Blob adds filename=... and OpenAI may parse the
    // request as files instead of the required `sdp` field. Build multipart
    // explicitly so it matches the documented curl request exactly.
    const boundary = `----SmartMenuRealtime${Date.now().toString(16)}`;
    const multipartBody = Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="sdp"\r\n` +
      `Content-Type: application/sdp\r\n\r\n` +
      String(sdp) + `\r\n` +
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="session"\r\n` +
      `Content-Type: application/json\r\n\r\n` +
      JSON.stringify(session) + `\r\n` +
      `--${boundary}--\r\n`,
      "utf8"
    );

    const openaiResponse = await fetch(
      "https://api.openai.com/v1/realtime/calls",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
          "Content-Length": String(multipartBody.length)
        },
        body: multipartBody
      }
    );

    const answerText = await openaiResponse.text();

    if (!openaiResponse.ok) {
      let message = answerText || `OpenAI Realtime HTTP ${openaiResponse.status}`;
      let code = "REALTIME_API_ERROR";
      try {
        const parsed = JSON.parse(answerText);
        message = parsed?.error?.message || parsed?.message || message;
        code = parsed?.error?.code || parsed?.error?.type || code;
      } catch (_) {}

      console.error("Realtime API error:", openaiResponse.status, answerText);
      return res.status(openaiResponse.status).json({
        ok: false,
        code,
        message
      });
    }

    return res.json({
      ok: true,
      sdp: answerText
    });
  } catch (error) {
    console.error("Realtime call error:", error);
    return res.status(500).json({
      ok: false,
      code: "REALTIME_SERVER_ERROR",
      message: error?.message || "تعذر تشغيل المحادثة الصوتية."
    });
  }
});

router.post("/ai", async (req, res) => {
  try {
    const {
      question,
      message,
      dish = null,
      menu = [],
      history = [],
      language = "ar"
    } = req.body || {};

    // Support both "question" and older "message" clients.
    const userQuestion = String(question || message || "").trim();

    if (!apiKey) {
      return res.status(401).json({
        ok: false,
        code: "invalid_api_key",
        message: "مفتاح OpenAI غير موجود في Render."
      });
    }

    if (!userQuestion) {
      return res.status(400).json({
        ok: false,
        code: "EMPTY_MESSAGE",
        message:
          language === "fr"
            ? "Veuillez écrire ou dire votre question."
            : language === "en"
            ? "Please type or say your question."
            : "الرجاء كتابة أو قول سؤالك."
      });
    }

    const restaurantProfile = await getRestaurantProfile();
    const restaurantNameForAi = language === "fr" ? (restaurantProfile.nameFr || restaurantProfile.nameAr) : language === "en" ? (restaurantProfile.nameEn || restaurantProfile.nameAr) : restaurantProfile.nameAr;

    const languageInstruction =
      language === "fr"
        ? "Réponds uniquement en français naturel, chaleureux et poli."
        : language === "en"
        ? "Reply only in natural, warm and polite English."
        : "أجب باللهجة السعودية البيضاء الطبيعية فقط، وتميل بشكل خفيف للهجة النجدية. استخدم تعبيرات سعودية يومية مفهومة مثل: هلا، أبشر، وش، وش ودك، تبي، ودك، تمام، من عيوني. تجنب اللهجات المصرية والشامية والتونسية، وتجنب الفصحى الرسمية إلا إذا احتجت توضيحًا دقيقًا. خل الجمل قصيرة وطبيعية كأنك نادلة سعودية فعلًا.";

    const instructions = `
Your name is Sara. You are the virtual AI waitress for ${restaurantNameForAi}.

LANGUAGE:
${languageInstruction}

ROLE:
- Help guests understand the menu.
- Answer the customer's actual question directly.
- Recommend food and drinks when asked.
- Compare options using only the supplied menu data.
- Never recommend or confirm an item marked available=false; explain briefly that it is currently unavailable and offer a visible available alternative.
- Respect stated budget and preferences.

ACCURACY:
- Never invent prices, ingredients, allergens, availability, or preparation details.
- If allergy information is missing, advise the guest to confirm with restaurant staff.
- If a price is "—", say the price is not listed.
- For Arabic customers, prices supplied in the menu are already converted for display in Saudi riyals. Mention prices in Saudi riyals only. Never mention Tunisian dinars, DT, or TND in Arabic responses.

STYLE:
- Your name is Sara. If the guest asks your name, say you are Sara.
- Sound like a real professional restaurant waitress, not like a chatbot.
- For Arabic, use natural Saudi spoken dialect.
- Keep answers short and conversational, usually 1-3 sentences.
- Ask a brief follow-up question when it helps, like a real waitress.
- On the first greeting, introduce yourself as Sara and mention ${restaurantNameForAi}.
- Do not repeat the greeting every turn.
- Never mention OpenAI, APIs, prompts, servers or technical details.
`;

    const context = {
      selectedDish: dish,
      menu
    };

    const conversation = Array.isArray(history)
      ? history
          .slice(-10)
          .map((m) => ({
            role: m && m.role === "assistant" ? "assistant" : "user",
            content: String((m && (m.content || m.text)) || "").trim()
          }))
          .filter((m) => m.content)
      : [];

    const response = await openai.responses.create({
      model: "gpt-4o-mini",
      instructions,
      input: [
        {
          role: "user",
          content: "MENU DATA:\n" + JSON.stringify(context)
        },
        ...conversation,
        {
          role: "user",
          content: userQuestion
        }
      ],
      max_output_tokens: 300
    });

    const answer = String(response.output_text || "").trim();

    if (!answer) {
      return res.status(502).json({
        ok: false,
        code: "EMPTY_AI_RESPONSE",
        message:
          language === "fr"
            ? "La serveuse n'a pas renvoyé de réponse."
            : language === "en"
            ? "The waitress returned no answer."
            : "لم تصل إجابة من النادلة."
      });
    }

    return res.json({ ok: true, answer });
  } catch (error) {
    console.error("AI error:", error);
    const e = normalizeOpenAIError(error);

    let message = e.message;
    if (e.code === "invalid_api_key") {
      message = "مفتاح OpenAI غير صحيح أو غير صالح.";
    } else if (e.code === "insufficient_quota") {
      message = "لا يوجد رصيد API كافٍ أو تم تجاوز الحصة.";
    }

    return res.status(e.status).json({
      ok: false,
      code: e.code,
      message
    });
  }
});

// ======================================================
// SPEECH TO TEXT
// ======================================================
function looksLikeArabicSttHallucination(text) {
  const raw = String(text || "").trim();
  if (!raw) return false;
  if (/[\u0600-\u06FF]/.test(raw)) return false;
  const normalized = raw.toLowerCase().replace(/[.,!?;:'"()[\]{}]/g, " ").replace(/\s+/g, " ").trim();
  const words = normalized.split(" ").filter(Boolean);
  // Keep plausible single foreign menu/product names such as "cappuccino".
  if (words.length <= 1) return false;
  // Common short meta/assistant hallucinations produced from weak/noisy Arabic audio.
  if (/\b(i should|i need|i would|i can|you should|we should|should ask|need to ask|thank you|thanks for|hello there)\b/.test(normalized)) return true;
  // A short all-Latin sentence in Arabic-locked STT is suspicious; reject rather
  // than displaying gibberish to the guest. Longer mixed requests pass through.
  if (/^[a-z0-9\s\-]+$/.test(normalized) && words.length >= 2 && words.length <= 5 && normalized.length <= 42) return true;
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

    // Experimental Deepgram STT + OpenAI brain/TTS engine. Arabic is pinned to
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

    // Experimental 3 favors transcription accuracy for very short Arabic
    // confirmations ("إيه", "نعم", "اعتمد"). Do not seed vocabulary prompts,
    // because prompts previously caused hallucinated approval phrases.
    const isHybrid3 = req.body.mode === "hybrid3";
    const options = {
      file: audioFile,
      model: isHybrid3 ? "gpt-4o-transcribe" : "gpt-4o-mini-transcribe"
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
    if (isHybrid3 && language === "ar" && looksLikeArabicSttHallucination(text)) {
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

    if (isHybrid3 && language === "ar" && looksLikeArabicSttHallucination(text)) {
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
function prepareArabicSaraTTS(text) {
  let out = String(text || "");
  const replacements = [
    [/أثبت الحجز/g, "أَثْبِت الحَجْز"],
    [/اثبت الحجز/g, "أَثْبِت الحَجْز"],
    [/أعتمد الحجز/g, "أَعْتَمِد الحَجْز"],
    [/اعتمد الحجز/g, "اِعْتَمِد الحَجْز"],
    [/اعتمدت الحجز/g, "اِعْتَمَدْت الحَجْز"],
    [/تم اعتماد الحجز/g, "تَمَّ اعْتِمَاد الحَجْز"],
    [/رقم الحجز/g, "رَقْم الحَجْز"],
    [/حجزك/g, "حَجْزَك"],
    [/الحجز/g, "الحَجْز"]
  ];
  for (const [pattern, replacement] of replacements) out = out.replace(pattern, replacement);
  const digitWords = {"0":"صِفْر","1":"واحِد","2":"اِثْنَيْن","3":"ثَلاثَة","4":"أَرْبَعَة","5":"خَمْسَة","6":"سِتَّة","7":"سَبْعَة","8":"ثَمانِيَة","9":"تِسْعَة"};
  out = out.replace(/(?:\+?\d[\d\s-]{7,}\d)/g, (num) => {
    const chars = num.replace(/[^0-9+]/g, "").split("");
    return chars.map(ch => ch === "+" ? "زائِد" : digitWords[ch]).filter(Boolean).join("، ");
  });
  return out;
}

// Cartesia does not expose a Saudi-Arabic locale code on the TTS endpoint;
// it accepts Arabic as `ar`. To keep Sara sounding as Saudi as the selected
// voice allows, feed Cartesia a dialect-optimized copy of the visible reply.
// This changes only speech rendering; the chat text remains untouched.
function prepareSaudiCartesiaTTS(text) {
  let out = String(text || "").trim();
  const replacements = [
    [/كيف يمكنني مساعدتك[؟?]?/g, "كيف أقدر أخدمك؟"],
    [/كيف أستطيع مساعدتك[؟?]?/g, "كيف أقدر أخدمك؟"],
    [/ماذا تريد/g, "وش ودك"],
    [/ماذا ترغب/g, "وش ودك"],
    [/هل تريد/g, "تبي"],
    [/هل ترغب/g, "ودك"],
    [/سوف /g, "بـ"],
    [/حسنًا/g, "تمام"],
    [/حسناً/g, "تمام"],
    [/بالطبع/g, "أبشر"],
    [/لا بأس/g, "ما عليه"],
    [/انتظر قليلًا/g, "لحظة بس"],
    [/انتظري قليلًا/g, "لحظة بس"],
    [/أريد أن أتأكد/g, "أبي أتأكد"],
    [/أود أن أتأكد/g, "أبي أتأكد"],
    [/يرجى/g, "لو سمحت"],
    [/يمكنك/g, "تقدر"],
    [/يمكنني/g, "أقدر"],
    [/تستطيع/g, "تقدر"],
    [/أستطيع/g, "أقدر"],
    [/سأقوم بتأكيد/g, "باعتمد"],
    [/تم تأكيد/g, "تم اعتماد"],
    [/مرحبًا/g, "هلا والله"],
    [/أهلاً وسهلاً/g, "حياك الله"],
    [/أهلا وسهلا/g, "حياك الله"]
  ];
  for (const [pattern, replacement] of replacements) out = out.replace(pattern, replacement);

  // TTS-friendly Saudi readings for phrases and digits that occur often in bookings.
  out = prepareArabicSaraTTS(out);
  return out
    .replace(/\s+/g, " ")
    .replace(/\s+([،.!؟?])/g, "$1")
    .trim();
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

router.post("/tts", async (req, res) => {
  try {
    const {
      text,
      language = "ar"
    } = req.body || {};

    if (!apiKey) {
      return res.status(401).json({
        ok: false,
        code: "invalid_api_key",
        message: "مفتاح OpenAI غير موجود."
      });
    }

    const cleanText = String(text || "").trim();

    if (!cleanText) {
      return res.status(400).json({
        ok: false,
        code: "EMPTY_TEXT",
        message: "لا يوجد نص لتحويله إلى صوت."
      });
    }

    // Experimental 3: match the OpenAI Realtime voice choice as closely as
    // the separate TTS endpoint allows. Realtime itself uses `coral`; use the
    // same voice here and keep the default playback rate (1.0).
    const voiceInstructions =
      language === "fr"
        ? "Parle naturellement en français, avec une voix chaleureuse et professionnelle de serveuse de restaurant."
        : language === "en"
        ? "Speak naturally in English, with a warm professional restaurant waitress tone."
        : "أنتِ سارة، موظفة سعودية شابة في مطعم في السعودية. تكلمي باللهجة السعودية البيضاء فقط، بميل نجدي خفيف وطبيعي. ممنوع اللهجة المصرية تمامًا، وكذلك الشامية والتونسية. لا تستخدمي نبرة أو إيقاع مصري. لا تتكلمي كأنك مذيعة أو قارئة نص. خلي الأداء محادثة سعودية يومية حقيقية، دافئة وواثقة وودودة، بسرعة طبيعية وجمل قصيرة. انطقي الجيم جيمًا سعودية واضحة، والهمزة والعين والحاء بوضوح. لا تفصّحي الكلمات ولا تمدّي الحروف ولا ترفعي النبرة في نهاية كل جملة. الوقفات قصيرة والنبرة ثابتة من أول الرد لآخره. التزمي بالتشكيل الموجود للكلمات الصعبة فقط. لا تبدين كمساعد آلي ولا كصوت إعلانات. حافظي على نفس اللهجة السعودية والنبرة من أول المقطع إلى آخره، ولا تنتقلي لأي لهجة أخرى حتى لو كان النص يحتوي اسم صنف أجنبي. تجنبي نطق الكلمات العربية بإيقاع مصري أو شامي.";

    const ttsText = language === "ar" ? prepareArabicSaraTTS(cleanText) : cleanText;
    const cacheKey = `${language}|coral|${ttsText}`;
    const cached = cleanText.length <= 220 ? getSaraTtsCache(cacheKey) : null;
    if (cached) {
      res.setHeader("Content-Type", "audio/mpeg");
      res.setHeader("Content-Length", cached.length);
      res.setHeader("Cache-Control", "private, max-age=3600");
      res.setHeader("X-Sara-TTS-Cache", "HIT");
      return res.send(cached);
    }

    const speech = await openai.audio.speech.create({
      model: "gpt-4o-mini-tts",
      voice: "coral",
      input: ttsText,
      instructions: voiceInstructions,
      speed: 1.0,
      response_format: "mp3"
    });

    const buffer = Buffer.from(await speech.arrayBuffer());
    if (cleanText.length <= 220) setSaraTtsCache(cacheKey, buffer);

    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Content-Length", buffer.length);
    res.setHeader("Cache-Control", "no-store");

    return res.send(buffer);
  } catch (error) {
    console.error("TTS error:", error);
    const e = normalizeOpenAIError(error);

    return res.status(e.status).json({
      ok: false,
      code: e.code,
      message: e.message || "تعذر تشغيل صوت النادلة."
    });
  }
});


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

    const cartesiaLanguage = language === "fr" ? "fr" : language === "en" ? "en" : "ar";
    const response = await fetch("https://api.cartesia.ai/tts/bytes", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.cartesiaApiKey}`,
        "Cartesia-Version": env.cartesiaApiVersion,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model_id: env.cartesiaTtsModel,
        transcript: language === "ar" ? prepareSaudiCartesiaTTS(cleanText) : cleanText,
        voice: { mode: "id", id: env.cartesiaVoiceId },
        output_format: { container: "wav", encoding: "pcm_s16le", sample_rate: 44100 },
        language: cartesiaLanguage,
        generation_config: { volume: 1, speed: language === "ar" ? 0.96 : 1 }
      })
    });

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
// OPENAI STT + OPENAI LLM + DEEPGRAM TTS (experimental)
// Deepgram currently does not publish an Arabic Aura/Flux TTS voice. For Arabic,
// this route safely falls back to the existing OpenAI Saudi-Arabic TTS unless
// DEEPGRAM_TTS_MODEL_AR is explicitly configured in the future.
// ======================================================
router.post("/deepgram-tts", async (req, res) => {
  try {
    const { text, language = "ar" } = req.body || {};
    const cleanText = String(text || "").trim();
    if (!cleanText) return res.status(400).json({ ok:false, code:"EMPTY_TEXT", message:"لا يوجد نص لتحويله إلى صوت." });
    if (!env.deepgramApiKey) return res.status(401).json({ ok:false, code:"DEEPGRAM_NOT_CONFIGURED", message:"مفتاح Deepgram غير موجود في Render." });

    const model = language === "fr" ? env.deepgramTtsModelFr : language === "en" ? env.deepgramTtsModelEn : env.deepgramTtsModelAr;
    if (language === "ar" && !model) {
      if (!apiKey) return res.status(409).json({ ok:false, code:"DEEPGRAM_ARABIC_TTS_UNSUPPORTED", message:"Deepgram لا يوفر صوت TTS عربي رسمي حاليًا، ومفتاح OpenAI غير متوفر للصوت الاحتياطي." });
      const voiceInstructions = "أنتِ سارة، موظفة سعودية شابة في مطعم في السعودية. تكلمي باللهجة السعودية البيضاء فقط، بميل نجدي خفيف وطبيعي، وبأسلوب محادثة يومي دافئ ومختصر. لا تنتقلي لأي لهجة أخرى.";
      const ttsText = prepareArabicSaraTTS(cleanText);
      const speech = await openai.audio.speech.create({ model:"gpt-4o-mini-tts", voice:"coral", input:ttsText, instructions:voiceInstructions, speed:1.0, response_format:"mp3" });
      const buffer = Buffer.from(await speech.arrayBuffer());
      res.setHeader("Content-Type", "audio/mpeg");
      res.setHeader("Content-Length", buffer.length);
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("X-Sara-TTS-Provider", "openai-arabic-fallback");
      return res.send(buffer);
    }

    const url = new URL("https://api.deepgram.com/v1/speak");
    url.searchParams.set("model", model);
    url.searchParams.set("encoding", "mp3");
    const response = await fetch(url, {
      method:"POST",
      headers:{ Authorization:`Token ${env.deepgramApiKey}`, "Content-Type":"application/json" },
      body:JSON.stringify({ text:cleanText })
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(detail || `Deepgram TTS HTTP ${response.status}`);
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length) throw new Error("Deepgram TTS returned empty audio.");
    res.setHeader("Content-Type", response.headers.get("content-type") || "audio/mpeg");
    res.setHeader("Content-Length", buffer.length);
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Sara-TTS-Provider", "deepgram");
    return res.send(buffer);
  } catch (error) {
    console.error("Deepgram TTS error:", error);
    return res.status(502).json({ ok:false, code:"DEEPGRAM_TTS_ERROR", message:error?.message || "تعذر تشغيل صوت Deepgram." });
  }
});


// ======================================================
// EXPERIMENTAL SARA ENGINE
// ElevenLabs Scribe STT -> DeepSeek V4 Flash -> Fish Audio TTS
// Keeps the existing OpenAI Realtime engine untouched as a fallback.
// ======================================================
function altEngineConfigured() {
  return Boolean(env.elevenLabsApiKey && env.deepseekApiKey && env.fishAudioApiKey && env.fishAudioVoiceId);
}

function altLanguageName(language) {
  if (language === "fr") return "French";
  if (language === "en") return "English";
  return "Saudi Arabic";
}

function altSaraInstructions({ language = "ar", menu = [], tableNumber = "", restaurantName = "المطعم" } = {}) {
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
- If the guest says they want a booking and provides some details, acknowledge those details as Sara and ask only for the next missing booking field.

MENU AND SERVICE:
- You know the supplied menu and should use only its data for items, descriptions and prices.
- Never recommend or confirm an item marked available=false. Say it is currently unavailable and suggest an available alternative.
- Never invent an item, ingredient, allergen, price or availability.
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
- The guest has THREE distinct choices: (1) order food/drinks to EAT OR DRINK INSIDE THE RESTAURANT, (2) order for EXTERNAL PICKUP/TAKEAWAY, or (3) RESERVE A TABLE only.
- If the guest starts ordering food/drinks and has not said which service they want, ask ONE short question in Arabic mode: "تبيه هنا بالمطعم ولا استلام خارجي؟"
- If they choose to eat/drink inside the restaurant: use order_mode="dinein". Collect items, quantities, item-specific modifications, and customer name for identification. Phone is optional. Do NOT ask for a booking date/time or party size unless they separately ask to reserve a table.
- If they choose pickup/takeaway: use order_mode="external". Collect items, quantities, item-specific modifications, customer name, and mobile/WhatsApp number.
- If they explicitly ask only to reserve a table: do not create a food order unless they also ask for a pre-order; use the booking flow below.
- Before any food/drink order is sent, summarize it briefly and ask for explicit confirmation. Only after approval call confirm_table_order.
- Keep every addition/removal/modification attached to the exact item in special_request, e.g. Burger Classique (بدون مايونيز), Latte (حليب شوفان). Never put item-specific changes in general notes.`}

BOOKING + OPTIONAL PRE-ORDER:
- You can collect name, WhatsApp phone, party size, date, time, notes, and optional menu items/quantities/modifications.
- Preserve phone digit order exactly. Saudi local 05xxxxxxxx may be normalized to +9665xxxxxxxx.
- Ask only for missing information.
- Before saving, summarize the booking/order and ask for explicit confirmation.
- IMPORTANT VOICE STYLE FOR BOOKING CONFIRMATION: speak the summary as one short natural sentence, never as a form, checklist, table, or Markdown list. Do not use Markdown symbols such as **, #, -, bullets, or labels like "الاسم:" and "رقم الواتساب:" in spoken replies.
- In Arabic, prefer a natural confirmation like: "تمام محمد، حجزك اليوم الساعة سبع ونص مساء لشخصين، وبدون طلب مسبق. أعتمد الحجز؟"
- Do not read the WhatsApp number back during the final summary unless the guest specifically asks to verify it or the number is ambiguous.
- Say dates and times in natural spoken words instead of raw machine-style values such as 2026-08-28 or 19:30.
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


router.get("/sara-alt-status", (req, res) => {
  return res.json({
    ok: true,
    configured: altEngineConfigured(),
    elevenlabsStt: Boolean(env.elevenLabsApiKey),
    deepseek: Boolean(env.deepseekApiKey),
    openaiLlm: Boolean(env.openaiApiKey),
    openaiLlmModel: env.openaiLlmModel,
    deepgramStt: Boolean(env.deepgramApiKey),
    deepgramSttModel: env.deepgramSttModel,
    deepgramSttLanguageAr: env.deepgramSttLanguageAr,
    deepgramTts: Boolean(env.deepgramApiKey),
    deepgramTtsArabicSupported: Boolean(env.deepgramTtsModelAr),
    kimi: Boolean(env.kimiApiKey),
    kimiModel: env.kimiModel,
    fishAudio: Boolean(env.fishAudioApiKey && env.fishAudioVoiceId),
    deepseekModel: env.deepseekModel,
    elevenlabsSttModel: env.elevenLabsSttModel,
    fishAudioModel: env.fishAudioModel,
    fishAudioVoiceId: env.fishAudioVoiceId
  });
});

router.post("/sara-alt-transcribe", upload.single("audio"), async (req, res) => {
  try {
    if (!env.elevenLabsApiKey) return res.status(401).json({ ok:false, code:"ELEVENLABS_STT_NOT_CONFIGURED", message:"مفتاح ElevenLabs غير موجود في Render." });
    if (!req.file) return res.status(400).json({ ok:false, code:"NO_AUDIO", message:"لم يتم استلام ملف صوتي." });

    const language = ["ar","fr","en"].includes(req.body?.language) ? req.body.language : "ar";
    const form = new FormData();
    const audioBlob = new Blob([req.file.buffer], { type: req.file.mimetype || "audio/webm" });
    form.append("file", audioBlob, req.file.originalname || "voice.webm");
    form.append("model_id", env.elevenLabsSttModel);
    form.append("language_code", language);
    form.append("tag_audio_events", "false");
    form.append("num_speakers", "1");

    const response = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
      method:"POST",
      headers:{ "xi-api-key": env.elevenLabsApiKey },
      body:form
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.detail?.message || data?.detail || data?.message || `ElevenLabs STT HTTP ${response.status}`);
    const text = String(data?.text || "").trim();
    if (!text) return res.status(422).json({ ok:false, code:"NO_SPEECH_DETECTED", message: language === "ar" ? "ما سمعت كلام واضح." : "No clear speech was detected." });
    return res.json({ ok:true, text, languageCode:data?.language_code || language });
  } catch (error) {
    console.error("ElevenLabs transcription error:", error);
    return res.status(502).json({ ok:false, code:"ELEVENLABS_STT_ERROR", message:error?.message || "تعذر تحويل الصوت إلى نص." });
  }
});

function brainProviderConfig(provider) {
  const p = String(provider || "deepseek").toLowerCase();
  if (p === "openai") return { provider:p, key:env.openaiApiKey, model:env.openaiLlmModel, label:"OpenAI" };
  if (p === "claude") return { provider:p, key:env.anthropicApiKey, model:env.anthropicModel, label:"Claude" };
  if (p === "gemini") return { provider:p, key:env.geminiApiKey, model:env.geminiModel, label:"Gemini" };
  if (p === "kimi") return { provider:p, key:env.kimiApiKey, model:env.kimiModel, label:"Kimi" };
  return { provider:"deepseek", key:env.deepseekApiKey, model:env.deepseekModel, label:"DeepSeek" };
}

function brainToolResult(call) {
  if (!call) return null;
  return { id:call.id || `brain_${Date.now()}`, name:call.name || "confirm_booking_order", arguments:typeof call.arguments === "string" ? call.arguments : JSON.stringify(call.arguments || {}) };
}

async function callOpenAICompatibleBrain({ endpoint, apiKey, model, messages, extraBody = {}, strictTools = true }) {
  const baseBody = { model, messages, tools:[confirmBookingOrderTool,confirmTableOrderTool].map(t=>strictTools?t:{...t,function:{...t.function,strict:undefined}}), tool_choice:"auto" };
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
  const call = Array.isArray(message.tool_calls) ? message.tool_calls.find(x => ["confirm_booking_order","confirm_table_order"].includes(x?.function?.name)) : null;
  if (call) return { toolCall:brainToolResult({ id:call.id, name:call.function?.name, arguments:call.function?.arguments }) };
  return { answer:String(message.content || "").trim() };
}

async function callClaudeBrain({ apiKey, model, system, history, userText }) {
  const tools = [confirmBookingOrderTool,confirmTableOrderTool].map(t=>({name:t.function.name,description:t.function.description,input_schema:t.function.parameters}));
  const messages = [...history, { role:"user", content:userText }];
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method:"POST",
    headers:{
      "x-api-key":apiKey,
      "anthropic-version":"2023-06-01",
      ...(env.anthropicWorkspaceId ? {"anthropic-workspace-id":env.anthropicWorkspaceId} : {}),
      "content-type":"application/json"
    },
    body:JSON.stringify({ model, system, messages, tools, tool_choice:{type:"auto"}, max_tokens:160, temperature:0.25 })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message || data?.message || `Claude HTTP ${response.status}`);
  const blocks = Array.isArray(data?.content) ? data.content : [];
  const tool = blocks.find(x => x?.type === "tool_use" && ["confirm_booking_order","confirm_table_order"].includes(x?.name));
  if (tool) return { toolCall:brainToolResult({ id:tool.id, name:tool.name, arguments:tool.input }) };
  return { answer:blocks.filter(x => x?.type === "text").map(x => x.text).join(" ").trim() };
}

function geminiSafeSchema(value) {
  if (Array.isArray(value)) return value.map(geminiSafeSchema);
  if (!value || typeof value !== "object") return value;
  const out = {};
  for (const [k,v] of Object.entries(value)) {
    if (k === "additionalProperties") continue;
    out[k] = geminiSafeSchema(v);
  }
  return out;
}

async function callGeminiBrain({ apiKey, model, system, history, userText }) {
  const declarations = [confirmBookingOrderTool,confirmTableOrderTool].map(t=>({name:t.function.name,description:t.function.description,parameters:geminiSafeSchema(t.function.parameters)}));
  const contents = history.map(m => ({ role:m.role === "assistant" ? "model" : "user", parts:[{text:m.content}] }));
  contents.push({ role:"user", parts:[{text:userText}] });
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const response = await fetch(endpoint, {
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    body:JSON.stringify({ systemInstruction:{parts:[{text:system}]}, contents, tools:[{functionDeclarations:declarations}], generationConfig:{temperature:0.25,maxOutputTokens:160} })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message || data?.message || `Gemini HTTP ${response.status}`);
  const parts = data?.candidates?.[0]?.content?.parts || [];
  const fc = parts.find(x => ["confirm_booking_order","confirm_table_order"].includes(x?.functionCall?.name))?.functionCall;
  if (fc) return { toolCall:brainToolResult({ name:fc.name, arguments:fc.args }) };
  return { answer:parts.map(x => x?.text || "").join(" ").trim() };
}

router.post("/sara-alt-chat", async (req, res) => {
  try {
    const { question = "", history = [], menu = [], language = "ar", greeting = false, bookingState = null, tableNumber = "", provider = "deepseek" } = req.body || {};
    const cfg = brainProviderConfig(provider);
    if (!cfg.key) return res.status(401).json({ ok:false, code:`${cfg.provider.toUpperCase()}_NOT_CONFIGURED`, message:`مفتاح ${cfg.label} غير موجود في Render.` });
    const q = String(question || "").trim();
    if (!q && !greeting) return res.status(400).json({ ok:false, code:"EMPTY_MESSAGE", message:"لا يوجد كلام لإرساله إلى سارة." });

    const cleanHistory = Array.isArray(history) ? history.slice(-4).map(m => ({
      role: m?.role === "assistant" ? "assistant" : "user",
      content: String(m?.content || m?.text || "").trim()
    })).filter(m => m.content) : [];
    const restaurantProfile = await getRestaurantProfile();
    const restaurantNameForSara = language === 'fr' ? (restaurantProfile.nameFr || restaurantProfile.nameAr) : language === 'en' ? (restaurantProfile.nameEn || restaurantProfile.nameAr) : restaurantProfile.nameAr;
    const system = altSaraInstructions({ language, menu, tableNumber:String(tableNumber||""), restaurantName:restaurantNameForSara }) + (bookingState && typeof bookingState === "object" ? `\n\nKNOWN BOOKING STATE FROM THE WEBSITE (authoritative):\n${JSON.stringify(bookingState)}\nSTRICT BOOKING MEMORY RULES:\n- Never ask again for any field that already has a non-empty value in this state.\n- If the guest corrects only the WhatsApp number, replace only the phone and preserve name, party size, date, time, notes, and order.\n- If the guest asks you to repeat the WhatsApp number, repeat the stored phone exactly digit by digit; do not invent or regroup digits.\n- A correction does not restart the booking flow. Continue from the remaining missing field, or ask for final confirmation if nothing is missing.\n- When the guest confirms, fill tool arguments from this state instead of leaving fields blank.` : "");
    const userText = greeting
      ? (language === "ar" ? `ابدئي الآن بالترحيب فقط: هلا والله، حياك في ${restaurantNameForSara}، معك سارة، كيف أقدر أخدمك؟` : language === "fr" ? "Accueille brièvement le client et demande comment tu peux l'aider." : "Give a very brief welcome and ask how you can help.")
      : q;

    let result;
    if (cfg.provider === "claude") {
      result = await callClaudeBrain({ apiKey:cfg.key, model:cfg.model, system, history:cleanHistory, userText });
    } else if (cfg.provider === "gemini") {
      result = await callGeminiBrain({ apiKey:cfg.key, model:cfg.model, system, history:cleanHistory, userText });

    } else {
      const messages = [{role:"system",content:system}, ...cleanHistory, {role:"user",content:userText}];
      if (cfg.provider === "openai") {
        result = await callOpenAICompatibleBrain({ endpoint:"https://api.openai.com/v1/chat/completions", apiKey:cfg.key, model:cfg.model, messages, extraBody:{max_completion_tokens:320}, strictTools:true });
      } else if (cfg.provider === "kimi") {
        result = await callOpenAICompatibleBrain({ endpoint:"https://api.moonshot.ai/v1/chat/completions", apiKey:cfg.key, model:cfg.model, messages, extraBody:{thinking:{type:"disabled"},temperature:0.6,top_p:0.95,max_tokens:384}, strictTools:false });
      } else {
        result = await callOpenAICompatibleBrain({ endpoint:"https://api.deepseek.com/chat/completions", apiKey:cfg.key, model:cfg.model, messages, extraBody:{thinking:{type:"disabled"}} });
      }
    }

    if (result?.toolCall) return res.json({ ok:true, toolCall:result.toolCall });
    const answer = String(result?.answer || "").trim();
    if (!answer) return res.status(502).json({ ok:false, code:"EMPTY_AI_RESPONSE", message:`لم تصل إجابة من ${cfg.label}.` });
    return res.json({ ok:true, answer, provider:cfg.provider });
  } catch (error) {
    console.error("Sara brain error:", error);
    return res.status(502).json({ ok:false, code:"SARA_BRAIN_ERROR", message:error?.message || "تعذر تشغيل عقل سارة." });
  }
});

function cleanSaraSpeechText(value) {
  let text = String(value || "");
  // Fish Audio should receive plain speech, never chat/Markdown formatting.
  text = text
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/`{1,3}/g, "")
    .replace(/^\s*[-*•]+\s*/gm, "")
    .replace(/^\s*#{1,6}\s*/gm, "")
    .replace(/\[(.*?)\]\([^)]*\)/g, "$1")
    .replace(/\n{2,}/g, ". ")
    .replace(/\n/g, "، ")
    .replace(/\s{2,}/g, " ")
    .trim();
  return text;
}

router.post("/sara-alt-tts", async (req, res) => {
  try {
    if (!env.fishAudioApiKey || !env.fishAudioVoiceId) return res.status(401).json({ ok:false, code:"FISH_AUDIO_NOT_CONFIGURED", message:"مفتاح Fish Audio أو Voice ID غير موجود في Render." });
    const text = cleanSaraSpeechText(req.body?.text);
    if (!text) return res.status(400).json({ ok:false, code:"EMPTY_TTS", message:"لا يوجد نص لتحويله إلى صوت." });

    const response = await fetch("https://api.fish.audio/v1/tts", {
      method:"POST",
      headers:{
        Authorization:`Bearer ${env.fishAudioApiKey}`,
        "Content-Type":"application/json",
        Accept:"audio/mpeg",
        model:env.fishAudioModel
      },
      body:JSON.stringify({
        text,
        reference_id:env.fishAudioVoiceId,
        format:"mp3"
      })
    });

    if (!response.ok) {
      const raw = await response.text().catch(() => "");
      let message = raw;
      try { const d = JSON.parse(raw); message = d?.detail?.message || d?.detail || d?.message || raw; } catch {}
      throw new Error(message || `Fish Audio HTTP ${response.status}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    res.setHeader("Content-Type", response.headers.get("content-type") || "audio/mpeg");
    res.setHeader("Content-Length", buffer.length);
    res.setHeader("Cache-Control", "no-store");
    return res.send(buffer);
  } catch (error) {
    console.error("Fish Audio TTS error:", error);
    return res.status(502).json({ ok:false, code:"FISH_AUDIO_ERROR", message:error?.message || "تعذر تشغيل صوت سارة عبر Fish Audio." });
  }
});


function createSaraRouter() {
  return router;
}

module.exports = { createSaraRouter };
