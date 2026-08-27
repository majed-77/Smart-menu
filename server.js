const express = require("express");
const path = require("path");
const OpenAI = require("openai");
const multer = require("multer");

const app = express();
const PORT = process.env.PORT || 3000;
const apiKey = process.env.OPENAI_API_KEY || "";

const openai = new OpenAI({ apiKey });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }
});

app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "smart-menu-ai-multilingual.html"));
});

function normalizeOpenAIError(error) {
  const status = Number(error?.status || 500);
  const rawMessage =
    error?.error?.message ||
    error?.message ||
    "OpenAI request failed.";

  let code =
    error?.code ||
    error?.type ||
    error?.error?.code ||
    "OPENAI_ERROR";

  if (status === 401) code = "invalid_api_key";
  if (status === 403 && code === "OPENAI_ERROR") code = "permission_denied";
  if (status === 429 && /quota|billing|credit/i.test(rawMessage)) {
    code = "insufficient_quota";
  }

  return { status, code, message: rawMessage };
}

app.get("/api/diagnostics", async (req, res) => {
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
      realtimeModel: "gpt-realtime-1.5",
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
app.post("/api/realtime-call", async (req, res) => {
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
      instructions: String(instructions || ""),
      output_modalities: ["audio"],
      max_output_tokens: 220,
      audio: {
        input: {
          turn_detection: {
            type: "server_vad",
            create_response: true,
            interrupt_response: true,
            silence_duration_ms: 650
          },
          transcription: {
            model: "gpt-4o-mini-transcribe",
            language: ["ar", "fr", "en"].includes(language) ? language : undefined
          }
        },
        output: {
          voice: "marin"
        }
      }
    };

    // Call the official Realtime WebRTC endpoint directly.
    // This avoids depending on a particular OpenAI Node SDK version.
    const form = new FormData();
    form.append(
      "sdp",
      new Blob([sdp], { type: "application/sdp" }),
      "offer.sdp"
    );
    form.append(
      "session",
      new Blob([JSON.stringify(session)], { type: "application/json" }),
      "session.json"
    );

    const openaiResponse = await fetch(
      "https://api.openai.com/v1/realtime/calls",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`
        },
        body: form
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

app.post("/api/ai", async (req, res) => {
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

    const languageInstruction =
      language === "fr"
        ? "Réponds uniquement en français naturel, chaleureux et poli."
        : language === "en"
        ? "Reply only in natural, warm and polite English."
        : "أجب باللهجة السعودية فقط، بأسلوب طبيعي وودود وخفيف. استخدم تعبيرات سعودية يومية مفهومة مثل: هلا، أبشر، وش، تبي، ودك، تمام، من عيوني. لا تستخدم الفصحى الرسمية إلا إذا احتجت توضيحًا دقيقًا.";

    const instructions = `
You are the virtual AI waitress for Café Victor Hugo in La Marsa.

LANGUAGE:
${languageInstruction}

ROLE:
- Help guests understand the menu.
- Answer the customer's actual question directly.
- Recommend food and drinks when asked.
- Compare options using only the supplied menu data.
- Respect stated budget and preferences.

ACCURACY:
- Never invent prices, ingredients, allergens, availability, or preparation details.
- If allergy information is missing, advise the guest to confirm with restaurant staff.
- If a price is "—", say the price is not listed.

STYLE:
- Sound like a real professional restaurant waitress, not like a chatbot.
- For Arabic, use natural Saudi spoken dialect.
- Keep answers short and conversational, usually 1-3 sentences.
- Ask a brief follow-up question when it helps, like a real waitress.
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
app.post("/api/transcribe", upload.single("audio"), async (req, res) => {
  try {
    if (!apiKey) {
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

    let filename = "speech.webm";
    const mime = req.file.mimetype || "audio/webm";

    if (mime.includes("mp4")) filename = "speech.m4a";
    else if (mime.includes("mpeg")) filename = "speech.mp3";
    else if (mime.includes("wav")) filename = "speech.wav";
    else if (mime.includes("ogg")) filename = "speech.ogg";

    const audioFile = new File(
      [req.file.buffer],
      filename,
      { type: mime }
    );

    const options = {
      file: audioFile,
      model: "gpt-4o-mini-transcribe"
    };

    if (["ar", "fr", "en"].includes(language)) {
      options.language = language;
    }

    const transcription =
      await openai.audio.transcriptions.create(options);

    const text = String(transcription.text || "").trim();

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
app.post("/api/tts", async (req, res) => {
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

    const voiceInstructions =
      language === "fr"
        ? "Parle naturellement en français, avec une voix chaleureuse et professionnelle de serveuse de restaurant."
        : language === "en"
        ? "Speak naturally in English, with a warm professional restaurant waitress tone."
        : "تحدث باللهجة السعودية الطبيعية، بصوت ودود وعفوي وواضح مثل نادلة سعودية حقيقية في مطعم راقٍ. خلي النبرة محادثة طبيعية وخفيفة، بدون فصحى رسمية وبدون أسلوب آلي.";

    const speech = await openai.audio.speech.create({
      model: "gpt-4o-mini-tts",
      voice: "coral",
      input: cleanText,
      instructions: voiceInstructions,
      response_format: "mp3"
    });

    const buffer = Buffer.from(await speech.arrayBuffer());

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

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "Smart Menu AI",
    apiKeyConfigured: Boolean(apiKey),
    timestamp: new Date().toISOString()
  });
});

app.use("/api", (req, res) => {
  res.status(404).json({
    ok: false,
    code: "NOT_FOUND",
    message: "API endpoint not found."
  });
});

app.use((error, req, res, next) => {
  console.error("Server error:", error);

  res.status(500).json({
    ok: false,
    code: "SERVER_ERROR",
    message: error?.message || "حدث خطأ في السيرفر."
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Smart Menu AI server running on port ${PORT}`);
  console.log(`🔑 OpenAI API Key: ${apiKey ? "Configured" : "NOT CONFIGURED"}`);
});
