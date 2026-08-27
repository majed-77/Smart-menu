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
const apiKey = process.env.OPENAI_API_KEY || "";
const openai = new OpenAI({ apiKey });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }
});

app.use(express.json({ limit: "3mb" }));
app.use(express.static(__dirname));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "smart-menu-ai-multilingual.html"));
});

function apiErrorPayload(error) {
  const status = Number(error?.status || error?.response?.status || 500);
  const rawCode = error?.code || error?.error?.code || error?.response?.data?.error?.code || "";
  const rawMessage =
    error?.error?.message ||
    error?.response?.data?.error?.message ||
    error?.message ||
    "OpenAI request failed.";

  let code = rawCode || "server_error";
  if (status === 401) code = "invalid_api_key";
  if (status === 403 && !rawCode) code = "permission_denied";
  if (status === 429 && /quota|billing|credit/i.test(rawMessage)) code = "insufficient_quota";

  return {
    status,
    body: {
      error: rawMessage,
      code
    }
  };
}

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    service: "Smart Menu AI",
    apiKeyConfigured: Boolean(apiKey),
    textModel: "gpt-4o-mini",
    transcriptionModel: "gpt-4o-mini-transcribe",
    speechModel: "gpt-4o-mini-tts"
  });
});

// Makes one tiny text request so the browser can tell whether the key/quota really works.
app.get("/api/diagnostics", async (req, res) => {
  if (!apiKey) {
    return res.status(401).json({
      ok: false,
      code: "invalid_api_key",
      error: "OPENAI_API_KEY is not configured on Render."
    });
  }
  try {
    const response = await openai.responses.create({
      model: "gpt-4o-mini",
      input: "Reply with exactly: OK",
      max_output_tokens: 5
    });
    const text = response.output_text?.trim() || "";
    return res.json({ ok: true, textModel: "gpt-4o-mini", result: text });
  } catch (error) {
    console.error("DIAGNOSTICS ERROR:", error);
    const {status, body} = apiErrorPayload(error);
    return res.status(status).json({ ok: false, ...body });
  }
});

app.post("/api/ai", async (req, res) => {
  try {
    const { question, dish, menu, history = [], language = "ar" } = req.body;
    if (!question) return res.status(400).json({ error: "Question is required.", code: "bad_request" });
    if (!apiKey) return res.status(401).json({ error: "OPENAI_API_KEY is not configured.", code: "invalid_api_key" });

    const langRule =
      language === "ar"
        ? "Answer only in natural Arabic. Keep original branded dish names when useful."
        : language === "en"
        ? "Answer only in natural English. Keep original branded dish names when useful."
        : "Réponds uniquement en français naturel. Conserve les noms de plats de marque si nécessaire.";

    const instructions = `You are the virtual waitress for Café Victor Hugo in La Marsa.
${langRule}
Be warm, concise, natural and helpful.
Use only the menu information provided by the application.
Never invent prices, ingredients, allergens, availability, or preparation details.
If allergy information is unavailable, tell the guest to confirm with restaurant staff.
Prices are in Tunisian dinars (DT).`;

    const menuContext = JSON.stringify({ selectedDish: dish || null, menu: menu || [] });
    const conversation = history.slice(-8).map(m => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: String(m.content || "")
    })).filter(m => m.content);

    const response = await openai.responses.create({
      model: "gpt-4o-mini",
      instructions,
      input: [
        { role: "user", content: "MENU DATA:\n" + menuContext },
        ...conversation,
        { role: "user", content: question }
      ],
      max_output_tokens: 250
    });

    const answer = response.output_text?.trim();
    if (!answer) throw new Error("The AI returned an empty response.");
    res.json({ answer });
  } catch (error) {
    console.error("AI ERROR:", error);
    const {status, body} = apiErrorPayload(error);
    res.status(status).json(body);
  }
});

app.post("/api/transcribe", upload.single("audio"), async (req, res) => {
  let tempPath = "";
  try {
    if (!req.file) return res.status(400).json({ error: "Audio file is required.", code: "bad_request" });
    if (!apiKey) return res.status(401).json({ error: "OPENAI_API_KEY is not configured.", code: "invalid_api_key" });

    const mime = req.file.mimetype || "";
    const ext =
      mime.includes("mp4") ? ".m4a" :
      mime.includes("mpeg") ? ".mp3" :
      mime.includes("wav") ? ".wav" :
      mime.includes("ogg") ? ".ogg" : ".webm";

    tempPath = path.join(os.tmpdir(), `smart-menu-${crypto.randomUUID()}${ext}`);
    await fs.promises.writeFile(tempPath, req.file.buffer);

    const args = {
      file: fs.createReadStream(tempPath),
      model: "gpt-4o-mini-transcribe"
    };
    if (["ar","fr","en"].includes(req.body.language)) args.language = req.body.language;

    const transcription = await openai.audio.transcriptions.create(args);
    const text = transcription.text?.trim();
    if (!text) return res.status(422).json({ error: "No speech was detected.", code: "no_speech" });

    res.json({ text });
  } catch (error) {
    console.error("TRANSCRIBE ERROR:", error);
    const {status, body} = apiErrorPayload(error);
    res.status(status).json(body);
  } finally {
    if (tempPath) fs.promises.unlink(tempPath).catch(() => {});
  }
});

app.post("/api/tts", async (req, res) => {
  try {
    const { text, language = "ar" } = req.body;
    if (!text) return res.status(400).json({ error: "Text is required.", code: "bad_request" });
    if (!apiKey) return res.status(401).json({ error: "OPENAI_API_KEY is not configured.", code: "invalid_api_key" });

    const style =
      language === "ar"
        ? "Speak warm, clear Arabic naturally, like a professional restaurant waitress."
        : language === "fr"
        ? "Parle en français avec une voix chaleureuse, claire et professionnelle."
        : "Speak warm, clear English naturally, like a professional restaurant waitress.";

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
    console.error("TTS ERROR:", error);
    const {status, body} = apiErrorPayload(error);
    res.status(status).json(body);
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Smart Menu AI running on port ${PORT}`);
  console.log(`OpenAI key configured: ${Boolean(apiKey)}`);
});
