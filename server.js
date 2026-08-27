import express from "express";
import path from "path";
import OpenAI from "openai";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

if (!process.env.OPENAI_API_KEY) {
  console.warn("⚠️ OPENAI_API_KEY is not configured.");
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

app.use(express.json({ limit: "2mb" }));

// تقديم ملفات الموقع
app.use(express.static(__dirname));

// الصفحة الرئيسية
app.get("/", (req, res) => {
  res.sendFile(
    path.join(__dirname, "smart-menu-ai-multilingual.html")
  );
});

// AI endpoint
app.post("/api/ai", async (req, res) => {
  try {
    const {
      question,
      dish,
      menu,
      history = [],
      language = "auto"
    } = req.body;

    if (!question) {
      return res.status(400).json({
        error: "Question is required."
      });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({
        error: "OPENAI_API_KEY is not configured."
      });
    }

    let languageInstruction = `
Detect the customer's language and answer in the same language.
The supported languages are Arabic, French, and English.
`;

    if (language === "ar") {
      languageInstruction = `
Always answer in Arabic.
Keep the original French dish names unchanged.
Use natural, friendly Arabic suitable for a restaurant waitress.
`;
    }

    if (language === "fr") {
      languageInstruction = `
Réponds toujours en français.
Utilise un ton naturel, chaleureux et professionnel,
comme une serveuse dans un restaurant.
`;
    }

    if (language === "en") {
      languageInstruction = `
Always answer in English.
Use a natural, friendly and professional restaurant waitress tone.
Keep original dish names unchanged.
`;
    }

    const systemPrompt = `
You are the virtual AI waitress for Café Victor Hugo in La Marsa.

Your job is to help customers understand the menu,
compare dishes and drinks, and make recommendations.

${languageInstruction}

IMPORTANT RULES:

- Only use information available in the provided menu.
- Never invent prices.
- Never invent ingredients.
- Never invent allergens.
- Never claim that a dish is allergy-safe unless the menu explicitly confirms it.
- If allergy information is unavailable, tell the customer to confirm with restaurant staff.
- If a price is shown as "—", explain that the price is not available in the menu.
- You may compare dishes using their descriptions and prices.
- You may recommend dishes according to the customer's budget.
- You may recommend combinations of food and drinks.
- Keep answers concise and conversational.
- Mention prices in DT when useful.
- Preserve original French dish names.
`;

    const context = {
      selectedDish: dish || null,
      menu: menu || []
    };

    const conversation = history
      .slice(-10)
      .map((message) => {
        return {
          role: message.role === "assistant" ? "assistant" : "user",
          content: String(message.content || message.text || "")
        };
      })
      .filter((message) => message.content.trim());

    const response = await openai.responses.create({
      model: "gpt-4.1-mini",

      instructions: systemPrompt,

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

    const answer =
      response.output_text ||
      "Je suis désolée, je n'ai pas pu répondre.";

    res.json({
      answer
    });

  } catch (error) {
    console.error("OpenAI API error:", error);

    res.status(500).json({
      error: "AI request failed.",
      details:
        process.env.NODE_ENV === "development"
          ? error.message
          : undefined
    });
  }
});

// فحص أن السيرفر يعمل
app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    service: "Smart Menu AI"
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Smart Menu AI server running on port ${PORT}`);
});
