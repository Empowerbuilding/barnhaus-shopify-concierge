import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import multer from "multer";
import { chat } from "./claude.js";
import { fetchFloorPlans, writeSubmission } from "./supabase.js";
import { sendN8nWebhook, sendDiscordNotification, writeToCRM, deleteDiscordMessage, notifyVanessa } from "./notify.js";
import { uploadImage, analyzeImage } from "./upload.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Multer — in-memory storage for image uploads
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Only images allowed"));
  }
});

// In-memory stores
const sessions = new Map();
let floorPlans = [];

// Load floor plans on startup
async function loadFloorPlans() {
  try {
    floorPlans = await fetchFloorPlans();
    console.log(`Loaded ${floorPlans.length} floor plans`);
  } catch (err) {
    console.error("Failed to load floor plans:", err.message);
  }
}

// Serve static React build
app.use(express.static(path.join(__dirname, "../client/dist")));

// Image upload endpoint
app.post("/api/upload", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file provided" });
    const { sessionId } = req.body;

    // Upload + analyze in parallel
    const [url, analysis] = await Promise.all([
      uploadImage(req.file.buffer, req.file.mimetype, req.file.originalname),
      analyzeImage(req.file.buffer, req.file.mimetype),
    ]);

    // Track in session
    if (sessionId && sessions.has(sessionId)) {
      const session = sessions.get(sessionId);
      session.imageUrls.push(url);
      if (!session.imageAnalyses) session.imageAnalyses = [];
      if (analysis) session.imageAnalyses.push({ url, analysis });
    }

    res.json({ url, analysis });
  } catch (err) {
    console.error("Upload error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", plans: floorPlans.length });
});

// Floor plans endpoint for frontend
app.get("/api/plans", (_req, res) => {
  res.json(floorPlans);
});

// Chat endpoint
app.post("/api/chat", async (req, res) => {
  try {
    const { sessionId, message } = req.body;

    if (!sessionId || !message) {
      return res.status(400).json({ error: "sessionId and message required" });
    }

    // Get or create session
    if (!sessions.has(sessionId)) {
      sessions.set(sessionId, { history: [], partialSaved: false, imageUrls: [], partialDiscordMsgId: null });
    }
    const session = sessions.get(sessionId);
    const history = session.history;

    // Add user message
    history.push({ role: "user", content: message });

    // Call Claude
    const aiResponse = await chat(history, floorPlans);

    // Add assistant response to history
    history.push({ role: "assistant", content: aiResponse });

    // Parse out any structured data from the response
    let suggestedPlans = [];
    let conversationComplete = false;
    let submissionData = null;
    // Extract suggest_plans
    const planMatch = aiResponse.match(
      /```json\s*\n?\s*\{[^}]*"suggest_plans"\s*:\s*(\[[^\]]*\])[^}]*\}\s*\n?\s*```/
    );
    if (planMatch) {
      try {
        suggestedPlans = JSON.parse(planMatch[1]);
      } catch {
        /* ignore parse errors */
      }
    }


    console.log('AI response length:', aiResponse.length, '| has conversation_complete:', aiResponse.includes('conversation_complete'));
    // Extract conversation_complete
    const completeMatch = aiResponse.match(
      /```json\s*\n?\s*(\{[^`]*"conversation_complete"\s*:\s*true[^`]*\})\s*\n?\s*```/s
    );
    if (completeMatch) {
      try {
        const parsed = JSON.parse(completeMatch[1]);
        conversationComplete = true;
        submissionData = parsed.submission_data;
      } catch {
        /* ignore parse errors */
      }
    }

    // Clean the response text — remove JSON blocks
    const cleanText = aiResponse
      .replace(/```json\s*\n?\s*\{[^`]*\}\s*\n?\s*```/gs, "")
      .trim();

    // Resolve suggested plan details
    const planDetails = suggestedPlans
      .map((id) => floorPlans.find((p) => String(p.id) === String(id)))
      .filter(Boolean);

    res.json({
      message: cleanText,
      suggestedPlans: planDetails,
      conversationComplete,
      submissionData,
    });
  } catch (err) {
    console.error("Chat error:", err);
    res.status(500).json({ error: "Failed to process chat message" });
  }
});

// Complete endpoint — writes to Supabase + fires webhooks
app.post("/api/complete", async (req, res) => {
  try {
    const { submissionData, sessionId } = req.body;

    if (!submissionData) {
      return res.status(400).json({ error: "submissionData required" });
    }

    // Attach image URLs + analyses from the session
    if (sessionId && sessions.has(sessionId)) {
      const session = sessions.get(sessionId);
      if (session.imageUrls?.length) submissionData.imageUrls = session.imageUrls;
      if (session.imageAnalyses?.length) submissionData.imageAnalyses = session.imageAnalyses;
    }

    // Resolve floor plan names from IDs
    if (submissionData.suggested_plans?.length) {
      submissionData.suggested_plan_names = submissionData.suggested_plans
        .map(id => floorPlans.find(p => p.id === id)?.title)
        .filter(Boolean);
    }

    // Delete partial Discord message if it exists
    const session = sessionId ? sessions.get(sessionId) : null;
    if (session?.partialDiscordMsgId) {
      deleteDiscordMessage(session.partialDiscordMsgId).catch(() => {});
      session.partialDiscordMsgId = null;
    }

    // Write to Supabase + notify + CRM
    console.log("CRM write — submissionData keys:", Object.keys(submissionData || {}));
    console.log("CRM write — notes sample:", submissionData?.lifestyle_notes, "|", submissionData?.summary?.slice(0,80));
    const results = await Promise.allSettled([
      writeSubmission(submissionData),
      sendN8nWebhook(submissionData),
      sendDiscordNotification(submissionData),
      writeToCRM(submissionData),
      notifyVanessa(submissionData),
    ]);

    const [dbResult, n8nResult, discordResult] = results;

    if (dbResult.status === "rejected") {
      console.error("DB write failed:", dbResult.reason);
    }
    if (n8nResult.status === "rejected") {
      console.error("n8n webhook failed:", n8nResult.reason);
    }
    if (discordResult.status === "rejected") {
      console.error("Discord notification failed:", discordResult.reason);
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Complete error:", err);
    res.status(500).json({ error: "Failed to complete submission" });
  }
});

// SPA fallback
app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "../client/dist/index.html"));
});

// Start server
loadFloorPlans().then(() => {
  
// Partial lead capture — fires when contact card is submitted
app.post("/api/partial", async (req, res) => {
  try {
    const { sessionId, name, email, phone } = req.body;
    if (!email) return res.json({ ok: false });
    const session = sessions.get(sessionId);
    if (session?.partialSaved) return res.json({ ok: true, skipped: true });
    if (session) session.partialSaved = true;
    const [firstName, ...rest] = (name || "").trim().split(" ");
    const lastName = rest.join(" ") || "Unknown";
    const partialMsgId = await sendDiscordNotification({ name, email, phone, status: "partial" });
    if (session) session.partialDiscordMsgId = partialMsgId;
    writeSubmission({ first_name: firstName, last_name: lastName, name, email, phone, status: "partial" }).catch(e => console.error("Partial save err:", e));
    writeToCRM({ first_name: firstName, last_name: lastName, email, phone, notes: "Partial lead — Design Concierge interview in progress." }).catch(e => console.error("Partial CRM err:", e));
    res.json({ ok: true });
  } catch (err) {
    console.error("Partial endpoint error:", err);
    res.json({ ok: false });
  }
});

app.listen(PORT, () => {
    console.log(`Barnhaus Design Concierge running on port ${PORT}`);
  });
});
