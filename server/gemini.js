// gemini.js — shared Gemini client (Google's OpenAI-compatible endpoint).
// Replaces the Anthropic SDK calls — Anthropic credits exhausted 11/23/26.
// reasoning_effort "none" keeps behavior equivalent to the previous
// non-thinking Claude models: predictable latency, no hidden token burn,
// and no truncation risk on the structured JSON completions.
//
// Env:
//   GEMINI_API_KEY (or GOOGLE_API_KEY) — required, set in Coolify env
//   GEMINI_MODEL — optional override, default gemini-3.5-flash

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash";
const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";

export function geminiConfigured() {
  return Boolean(GEMINI_API_KEY);
}

export async function geminiChat({ system, messages, maxTokens = 1024 }) {
  if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY env var not set on concierge server");

  const oaiMessages = [];
  if (system) oaiMessages.push({ role: "system", content: system });
  for (const m of messages || []) {
    // Content may be a plain string (chat history) or an OpenAI-style
    // parts array (vision) — pass both through unchanged.
    const content =
      typeof m.content === "string" ? m.content
      : Array.isArray(m.content) ? m.content
      : String(m.content ?? "");
    oaiMessages.push({ role: m.role, content });
  }

  const res = await fetch(GEMINI_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${GEMINI_API_KEY}`,
    },
    body: JSON.stringify({
      model: GEMINI_MODEL,
      max_tokens: maxTokens,
      reasoning_effort: "none",
      messages: oaiMessages,
    }),
  });

  if (!res.ok) {
    throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error(`Gemini empty response (finish_reason=${data?.choices?.[0]?.finish_reason})`);
  }
  return content;
}

export async function geminiVision({ prompt, imageBase64, mimetype, maxTokens = 400 }) {
  return geminiChat({
    messages: [{
      role: "user",
      content: [
        { type: "text", text: prompt },
        { type: "image_url", image_url: { url: `data:${mimetype};base64,${imageBase64}` } },
      ],
    }],
    maxTokens,
  });
}
