import express from "express";
import path from "path";
import OpenAI from "openai";
import multer from "multer";
import fs from "fs";
import os from "os";
import crypto from "crypto";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 }
});

app.use(express.json({ limit: "3mb" }));
app.use(express.static(__dirname));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "smart-menu-ai-multilingual.html"));
});

app.get("/api/health", (req, res) => {
  res.json({ ok: true, apiKeyConfigured: Boolean(process.env.OPENAI_API_KEY) });
});

app.post("/api/ai", async (req, res) => {
  try {
    const { question, dish, menu, history = [], language = "ar" } = req.body;
    if (!question) return res.status(400).json({ error: "Question is required." });

    const langRule =
      language === "ar" ? "Answer only in natural Arabic. Keep French menu item names unchanged." :
      language === "en" ? "Answer only in natural English. Keep French menu item names unchanged." :
      "Réponds uniquement en français naturel.";

    const instructions = `You are the virtual waitress for Café Victor Hugo in La Marsa.
${langRule}
Be warm, concise, natural and helpful.
Use only the provided menu data. Never invent prices, ingredients, allergens, availability, or preparation details.
If allergy information is missing, advise the guest to confirm with restaurant staff.
Prices are in Tunisian dinars (DT).`;

    const context = JSON.stringify({ selectedDish: dish || null, menu: menu || [] });
    const conversation = history.slice(-10).map(m => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: String(m.content || "")
    })).filter(m => m.content);

    const response = await openai.responses.create({
      model: "gpt-4.1-mini",
      instructions,
      input: [
        { role: "user", content: "MENU DATA:\n" + context },
        ...conversation,
        { role: "user", content: question }
      ]
    });

    const answer = response.output_text?.trim();
    if (!answer) throw new Error("Empty model response");
    res.json({ answer });
  } catch (error) {
    console.error("AI ERROR", error);
    res.status(500).json({ error: error?.message || "AI request failed." });
  }
});

app.post("/api/transcribe", upload.single("audio"), async (req, res) => {
  let tempPath = "";
  try {
    if (!req.file) return res.status(400).json({ error: "Audio file is required." });

    const ext =
      req.file.mimetype?.includes("mp4") ? ".m4a" :
      req.file.mimetype?.includes("mpeg") ? ".mp3" :
      req.file.mimetype?.includes("wav") ? ".wav" : ".webm";

    tempPath = path.join(os.tmpdir(), `smart-menu-${crypto.randomUUID()}${ext}`);
    await fs.promises.writeFile(tempPath, req.file.buffer);

    const args = {
      file: fs.createReadStream(tempPath),
      model: "gpt-4o-mini-transcribe"
    };
    if (req.body.language && ["ar","fr","en"].includes(req.body.language)) {
      args.language = req.body.language;
    }

    const transcription = await openai.audio.transcriptions.create(args);
    const text = transcription.text?.trim();
    if (!text) throw new Error("No speech detected");
    res.json({ text });
  } catch (error) {
    console.error("TRANSCRIBE ERROR", error);
    res.status(500).json({ error: error?.message || "Voice transcription failed." });
  } finally {
    if (tempPath) fs.promises.unlink(tempPath).catch(() => {});
  }
});

app.post("/api/tts", async (req, res) => {
  try {
    const { text, language = "ar" } = req.body;
    if (!text) return res.status(400).json({ error: "Text is required." });

    const style =
      language === "ar" ? "Speak warm, clear Arabic naturally, like a professional restaurant waitress." :
      language === "fr" ? "Parle en français avec une voix chaleureuse, claire et professionnelle." :
      "Speak warm, clear English naturally, like a professional restaurant waitress.";

    const audio = await openai.audio.speech.create({
      model: "gpt-4o-mini-tts",
      voice: "coral",
      input: text,
      instructions: style,
      response_format: "mp3"
    });

    const buffer = Buffer.from(await audio.arrayBuffer());
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "no-store");
    res.send(buffer);
  } catch (error) {
    console.error("TTS ERROR", error);
    res.status(500).json({ error: error?.message || "Speech generation failed." });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Smart Menu AI running on port ${PORT}`);
});
