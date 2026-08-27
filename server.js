const express = require("express");
const path = require("path");
const OpenAI = require("openai");
const multer = require("multer");

const app = express();
const PORT = process.env.PORT || 3000;

// ======================================================
// OpenAI
// ======================================================

if (!process.env.OPENAI_API_KEY) {
  console.warn("⚠️ OPENAI_API_KEY is not configured.");
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// ======================================================
// Middleware
// ======================================================

app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true }));

// ملفات الموقع
app.use(express.static(__dirname));

// رفع الصوت في الذاكرة
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 15 * 1024 * 1024
  }
});

// ======================================================
// الصفحة الرئيسية
// ======================================================

app.get("/", (req, res) => {
  res.sendFile(
    path.join(__dirname, "smart-menu-ai-multilingual.html")
  );
});

// ======================================================
// فحص السيرفر و OpenAI
// ======================================================

app.get("/api/diagnostics", async (req, res) => {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({
        ok: false,
        error: "OPENAI_API_KEY_NOT_CONFIGURED",
        message: "OPENAI_API_KEY غير موجود في Render."
      });
    }

    const response = await openai.responses.create({
      model: "gpt-4o-mini",
      input: "Reply with exactly: OK",
      max_output_tokens: 16
    });

    return res.json({
      ok: true,
      openai: true,
      model: "gpt-4o-mini",
      message: "Smart Menu server and OpenAI are working.",
      response: response.output_text || "OK"
    });

  } catch (error) {
    console.error("Diagnostics error:", error);

    return res.status(error.status || 500).json({
      ok: false,
      error: error.code || error.type || "OPENAI_ERROR",
      message:
        error?.error?.message ||
        error?.message ||
        "حدث خطأ أثناء الاتصال بـ OpenAI."
    });
  }
});

// ======================================================
// AI waiter
// ======================================================

app.post("/api/ai", async (req, res) => {
  try {
    const {
      message,
      language = "ar",
      itemName = "",
      itemDescription = "",
      itemPrice = ""
    } = req.body || {};

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({
        ok: false,
        error: "OPENAI_API_KEY_NOT_CONFIGURED",
        message: "مفتاح OpenAI غير موجود في إعدادات Render."
      });
    }

    if (!message || !message.trim()) {
      return res.status(400).json({
        ok: false,
        error: "EMPTY_MESSAGE",
        message: "الرجاء كتابة أو قول سؤالك."
      });
    }

    // تحديد لغة المحادثة
    let languageInstruction;

    if (language === "fr") {
      languageInstruction =
        "Réponds uniquement en français naturel et poli.";
    } else if (language === "en") {
      languageInstruction =
        "Reply only in natural, polite English.";
    } else {
      languageInstruction =
        "أجب باللغة العربية فقط وبأسلوب طبيعي ومهذب وواضح.";
    }

    const systemPrompt = `
You are the virtual AI waitress for Café Victor Hugo in La Marsa.

Your job is to help customers understand the menu and choose food or drinks.

LANGUAGE:
${languageInstruction}

IMPORTANT RULES:
- Be friendly, professional, warm and concise.
- Speak like a real restaurant waiter/waitress.
- Answer the customer's actual question directly.
- Do not repeat the same greeting in every response.
- Do not invent ingredients, prices or menu information.
- If information is not available, clearly say that and suggest asking the restaurant staff.
- If the customer asks about allergies, clearly explain that restaurant staff should confirm allergen safety.
- If the customer asks for a recommendation, use the menu item information available in the conversation.
- Keep normal spoken answers relatively short because the answer may be read aloud.
- Never mention APIs, OpenAI, prompts, servers or technical details to the customer.

CURRENT MENU ITEM:
Name: ${itemName || "Not specified"}
Description: ${itemDescription || "Not specified"}
Price: ${itemPrice || "Not specified"}
`;

    const response = await openai.responses.create({
      model: "gpt-4o-mini",

      instructions: systemPrompt,

      input: message.trim(),

      max_output_tokens: 300
    });

    const answer = response.output_text?.trim();

    if (!answer) {
      return res.status(500).json({
        ok: false,
        error: "EMPTY_AI_RESPONSE",
        message: "لم يتم استلام رد من الذكاء الاصطناعي."
      });
    }

    return res.json({
      ok: true,
      answer
    });

  } catch (error) {
    console.error("AI error:", error);

    let friendlyMessage =
      error?.error?.message ||
      error?.message ||
      "تعذر الاتصال بالذكاء الاصطناعي.";

    if (error.status === 401) {
      friendlyMessage =
        "مفتاح OpenAI غير صحيح أو غير صالح.";
    }

    if (error.status === 429) {
      friendlyMessage =
        "تم الوصول إلى حد استخدام OpenAI أو لا يوجد رصيد كافٍ في الحساب.";
    }

    return res.status(error.status || 500).json({
      ok: false,
      error: error.code || error.type || "AI_ERROR",
      message: friendlyMessage
    });
  }
});

// ======================================================
// Speech to Text
// تحويل صوت العميل إلى كتابة
// ======================================================

app.post(
  "/api/transcribe",
  upload.single("audio"),
  async (req, res) => {

    try {

      if (!process.env.OPENAI_API_KEY) {
        return res.status(500).json({
          ok: false,
          error: "OPENAI_API_KEY_NOT_CONFIGURED",
          message: "مفتاح OpenAI غير موجود."
        });
      }

      if (!req.file) {
        return res.status(400).json({
          ok: false,
          error: "NO_AUDIO",
          message: "لم يتم استلام ملف صوتي."
        });
      }

      const language = req.body.language || "ar";

      let filename = "speech.webm";

      if (
        req.file.mimetype &&
        req.file.mimetype.includes("mp4")
      ) {
        filename = "speech.mp4";
      }

      if (
        req.file.mimetype &&
        req.file.mimetype.includes("mpeg")
      ) {
        filename = "speech.mp3";
      }

      if (
        req.file.mimetype &&
        req.file.mimetype.includes("wav")
      ) {
        filename = "speech.wav";
      }

      const audioFile = new File(
        [req.file.buffer],
        filename,
        {
          type:
            req.file.mimetype ||
            "audio/webm"
        }
      );

      const transcriptionOptions = {
        file: audioFile,
        model: "gpt-4o-mini-transcribe"
      };

      // نحدد اللغة عندما يختارها العميل
      if (language === "ar") {
        transcriptionOptions.language = "ar";
      }

      if (language === "en") {
        transcriptionOptions.language = "en";
      }

      if (language === "fr") {
        transcriptionOptions.language = "fr";
      }

      const transcription =
        await openai.audio.transcriptions.create(
          transcriptionOptions
        );

      const text =
        transcription.text?.trim() || "";

      if (!text) {
        return res.status(400).json({
          ok: false,
          error: "NO_SPEECH_DETECTED",
          message:
            "لم أتمكن من سماع كلام واضح. حاول مرة أخرى."
        });
      }

      return res.json({
        ok: true,
        text
      });

    } catch (error) {

      console.error(
        "Transcription error:",
        error
      );

      return res.status(
        error.status || 500
      ).json({
        ok: false,
        error:
          error.code ||
          error.type ||
          "TRANSCRIPTION_ERROR",

        message:
          error?.error?.message ||
          error?.message ||
          "تعذر تحويل الصوت إلى نص."
      });
    }
  }
);

// ======================================================
// Text to Speech
// تحويل رد النادلة إلى صوت
// ======================================================

app.post("/api/tts", async (req, res) => {

  try {

    const {
      text,
      language = "ar"
    } = req.body || {};

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({
        ok: false,
        error: "OPENAI_API_KEY_NOT_CONFIGURED",
        message: "مفتاح OpenAI غير موجود."
      });
    }

    if (!text || !text.trim()) {
      return res.status(400).json({
        ok: false,
        error: "EMPTY_TEXT",
        message:
          "لا يوجد نص لتحويله إلى صوت."
      });
    }

    let voiceInstructions;

    if (language === "fr") {
      voiceInstructions =
        "Speak naturally in French with a warm, elegant restaurant waitress tone. Do not sound robotic.";
    } else if (language === "en") {
      voiceInstructions =
        "Speak naturally in English with a warm and professional restaurant waitress tone. Do not sound robotic.";
    } else {
      voiceInstructions =
        "تحدث بالعربية بشكل طبيعي وواضح وهادئ، بنبرة نادلة مطعم راقية وودودة. لا تتحدث بنبرة آلية.";
    }

    const speech =
      await openai.audio.speech.create({
        model: "gpt-4o-mini-tts",
        voice: "coral",
        input: text.trim(),
        instructions: voiceInstructions,
        response_format: "mp3"
      });

    const buffer =
      Buffer.from(
        await speech.arrayBuffer()
      );

    res.setHeader(
      "Content-Type",
      "audio/mpeg"
    );

    res.setHeader(
      "Content-Length",
      buffer.length
    );

    res.setHeader(
      "Cache-Control",
      "no-store"
    );

    return res.send(buffer);

  } catch (error) {

    console.error("TTS error:", error);

    return res.status(
      error.status || 500
    ).json({
      ok: false,
      error:
        error.code ||
        error.type ||
        "TTS_ERROR",

      message:
        error?.error?.message ||
        error?.message ||
        "تعذر تشغيل صوت النادلة."
    });
  }
});

// ======================================================
// Health check
// ======================================================

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "Smart Menu AI",
    timestamp: new Date().toISOString()
  });
});

// ======================================================
// 404 API
// ======================================================

app.use("/api", (req, res) => {
  res.status(404).json({
    ok: false,
    error: "NOT_FOUND",
    message: "API endpoint not found."
  });
});

// ======================================================
// Error handler
// ======================================================

app.use((error, req, res, next) => {

  console.error(
    "Server error:",
    error
  );

  res.status(500).json({
    ok: false,
    error: "SERVER_ERROR",
    message:
      error?.message ||
      "حدث خطأ في السيرفر."
  });
});

// ======================================================
// Start Server
// ======================================================

app.listen(PORT, "0.0.0.0", () => {

  console.log(
    `✅ Smart Menu AI server running on port ${PORT}`
  );

  console.log(
    `🔑 OpenAI API Key: ${
      process.env.OPENAI_API_KEY
        ? "Configured"
        : "NOT CONFIGURED"
    }`
  );

});
