const express = require("express");
const path = require("path");
const OpenAI = require("openai");

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
        error: "Question is required"
      });
    }

    const languageInstruction =
      language === "ar"
        ? "Reply in Arabic."
        : language === "fr"
        ? "Reply in French."
        : language === "en"
        ? "Reply in English."
        : "Detect the customer's language and reply in the same language.";

    const systemPrompt = `
You are the virtual AI waitress for Café Victor Hugo in La Marsa, Tunisia.

Your job is to help customers understand the menu and choose food and drinks.

LANGUAGE:
${languageInstruction}

Keep original French dish names unchanged.

RULES:
- Only recommend items that exist in the supplied menu.
- Never invent prices.
- Never invent ingredients.
- Never invent allergens.
- Never claim an item is allergen-free unless the menu explicitly confirms it.
- If allergy information is unavailable, tell the customer to confirm with restaurant staff.
- Respect the customer's budget.
- Remember preferences mentioned during the conversation.
- If the customer says they dislike or cannot eat something, avoid recommending it.
- You may compare dishes.
- You may recommend combinations of food and drinks.
- When recommending something, briefly explain why.
- Prices are in Tunisian dinars (DT).
- Be friendly and concise, like a professional restaurant waitress.
`;

    const conversation = history
      .slice(-10)
      .map(
        (message) =>
          `${message.role === "user" ? "Customer" : "Waitress"}: ${
            message.content
          }`
      )
      .join("\n");

    const context = `
CURRENT DISH:
${dish ? JSON.stringify(dish) : "No specific dish selected"}

MENU:
${JSON.stringify(menu)}

RECENT CONVERSATION:
${conversation || "No previous conversation"}

CUSTOMER QUESTION:
${question}
`;

    const response = await openai.responses.create({
      model: "gpt-5-mini",
      instructions: systemPrompt,
      input: context
    });

    const answer =
      response.output_text ||
      "Sorry, I could not generate an answer.";

    res.json({
      answer
    });
  } catch (error) {
    console.error("AI ERROR:", error);

    res.status(500).json({
      error: "AI request failed",
      message: error.message
    });
  }
});

app.listen(PORT, () => {
  console.log(`Smart Menu running on port ${PORT}`);
});