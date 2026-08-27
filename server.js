import express from "express";
import path from "path";
import OpenAI from "openai";
import multer from "multer";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 12 * 1024 * 1024
  }
});

if (!process.env.OPENAI_API_KEY) {
  console.warn("⚠️ OPENAI_API_KEY is not configured.");
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

app.use(express.json({ limit: "2mb" }));

app.use(express.static(__dirname));

app.get("/", (req, res) => {
  res.sendFile(
    path.join(
      __dirname,
      "smart-menu-ai-multilingual.html"
    )
  );
});

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    service: "Smart Menu AI"
  });
});


// ===============================
// AI CHAT
// ===============================

app.post("/api/ai", async (req, res) => {

  try {

    const {
      question,
      dish,
      menu,
      history = [],
      language = "auto",
      detectedLanguage
    } = req.body;


    if (!question) {
      return res.status(400).json({
        error: "Question is required."
      });
    }


    const chosen =
      language === "auto"
        ? (detectedLanguage || "fr")
        : language;


    const languageInstruction =
      chosen === "ar"

        ? `
Always answer in natural Arabic.
Keep original French dish names unchanged.
`

        : chosen === "en"

        ? `
Always answer in natural English.
Keep original French dish names unchanged.
`

        : `
Réponds toujours en français naturel.
`;


    const instructions = `
You are the virtual AI waitress for Café Victor Hugo in La Marsa.

${languageInstruction}

Only use information in the provided menu.

Never invent:

- prices
- ingredients
- allergens
- availability
- preparation details

If allergy information is unavailable,
tell the customer to confirm with restaurant staff.

If a price is "—",
say that the price is not listed.

You may compare menu items.

You may recommend food and drinks according
to the customer's budget and preferences.

Be warm, concise and conversational.

Prices are in DT.
`;


    const context = {
      selectedDish: dish || null,
      menu: menu || []
    };


    const conversation = history
      .slice(-10)
      .map(message => ({

        role:
          message.role === "assistant"
            ? "assistant"
            : "user",

        content:
          String(
            message.content ||
            message.text ||
            ""
          )

      }))
      .filter(message =>
        message.content.trim()
      );


    const response =
      await openai.responses.create({

        model: "gpt-4.1-mini",

        instructions,

        input: [

          {
            role: "user",

            content:
              "Restaurant menu context:\n" +
              JSON.stringify(context)
          },

          ...conversation,

          {
            role: "user",
            content: question
          }

        ]

      });


    res.json({

      answer:
        response.output_text || ""

    });


  } catch (error) {

    console.error(
      "AI error:",
      error
    );

    res.status(500).json({

      error:
        "AI request failed."

    });

  }

});


// ===============================
// SPEECH TO TEXT
// ===============================

app.post(
  "/api/transcribe",

  upload.single("audio"),

  async (req, res) => {

    try {

      if (!req.file) {

        return res.status(400).json({

          error:
            "Audio file is required."

        });

      }


      const file =
        new File(

          [req.file.buffer],

          req.file.originalname ||
          "question.webm",

          {

            type:
              req.file.mimetype ||
              "audio/webm"

          }

        );


      const options = {

        file,

        model:
          "gpt-4o-mini-transcribe"

      };


      if (
        req.body.language &&
        req.body.language !== "auto"
      ) {

        options.language =
          req.body.language;

      }


      const transcription =
        await openai.audio.transcriptions.create(
          options
        );


      res.json({

        text:
          transcription.text || ""

      });


    } catch (error) {

      console.error(
        "Transcription error:",
        error
      );


      res.status(500).json({

        error:
          "Voice transcription failed."

      });

    }

  }
);


// ===============================
// TEXT TO SPEECH
// ===============================

app.post(
  "/api/tts",

  async (req, res) => {

    try {

      const {
        text
      } = req.body;


      if (!text) {

        return res.status(400).json({

          error:
            "Text is required."

        });

      }


      const audio =
        await openai.audio.speech.create({

          model:
            "gpt-4o-mini-tts",

          voice:
            "coral",

          input:
            text,

          instructions:
            `
Speak warmly and naturally
like a professional café waitress.

Preserve the language
of the input.
`

        });


      const buffer =
        Buffer.from(
          await audio.arrayBuffer()
        );


      res.setHeader(
        "Content-Type",
        "audio/mpeg"
      );


      res.setHeader(
        "Cache-Control",
        "no-store"
      );


      res.send(
        buffer
      );


    } catch (error) {

      console.error(
        "TTS error:",
        error
      );


      res.status(500).json({

        error:
          "Speech generation failed."

      });

    }

  }
);


// ===============================
// START SERVER
// ===============================

app.listen(
  PORT,
  "0.0.0.0",
  () => {

    console.log(
      `✅ Smart Menu AI server running on port ${PORT}`
    );

  }
);
