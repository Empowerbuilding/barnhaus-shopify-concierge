import { useState, useRef, useCallback, useEffect } from "react";

const SESSION_KEY = "barnhaus_concierge_session";

function generateId() {
  return "s_" + Math.random().toString(36).slice(2, 11) + Date.now().toString(36);
}

// Field card definitions — only contact + location are shown (first 2 turns)
const FIELD_STEPS = [
  {
    id: "contact",
    fields: [
      { key: "name", label: "Your Name", type: "text", placeholder: "Full name", flex: "1 1 180px" },
      { key: "email", label: "Email", type: "text", placeholder: "you@email.com", flex: "1 1 180px" },
      { key: "phone", label: "Phone", type: "text", placeholder: "(555) 000-0000", flex: "1 1 140px" },
    ]
  },
  {
    id: "location",
    fields: [
      { key: "location", label: "City, State", type: "text", placeholder: "e.g. Boerne, TX", flex: "1 1 200px" },
      { key: "lot_size_acres", label: "Acres", type: "number", placeholder: "e.g. 5" },
      { key: "land_owned", label: "Own the Land?", type: "boolean" },
    ]
  },
];

function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Expire sessions older than 24 hours
    if (Date.now() - parsed.savedAt > 24 * 60 * 60 * 1000) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return parsed;
  } catch { return null; }
}

function saveSession(sessionId, messages, isComplete, aiTurnCount) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify({
      sessionId,
      messages,
      isComplete,
      aiTurnCount,
      savedAt: Date.now(),
    }));
  } catch {}
}

export function useChat() {
  const saved = useRef(loadSession());
  const sessionId = useRef(saved.current?.sessionId || generateId());

  const [messages, setMessages] = useState(saved.current?.messages || []);
  const [isLoading, setIsLoading] = useState(false);
  const [isComplete, setIsComplete] = useState(saved.current?.isComplete || false);
  const [submissionData, setSubmissionData] = useState(null);
  const [activeFields, setActiveFields] = useState(null);
  const [uploadPrompted, setUploadPrompted] = useState(false);
  const hasGreeted = useRef(!!saved.current);
  const aiTurnCount = useRef(saved.current?.aiTurnCount || 0);

  // Persist session to localStorage whenever messages change
  useEffect(() => {
    if (messages.length > 0) {
      saveSession(sessionId.current, messages, isComplete, aiTurnCount.current);
    }
  }, [messages, isComplete]);

  // Only show field cards for first 2 turns (contact + location)
  const maybeShowNextCard = useCallback((turnCount) => {
    if (turnCount < 2) {
      setActiveFields(FIELD_STEPS[turnCount].fields);
    } else {
      setActiveFields(null);
    }
  }, []);

  const handleResponse = useCallback(async (data) => {
    const aiMsg = { role: "assistant", text: data.message, suggestedPlans: data.suggestedPlans || [] };
    setMessages((prev) => [...prev, aiMsg]);
    const asksForUpload = /upload|photo|picture|image|survey|aerial/i.test(data.message);
    setUploadPrompted(asksForUpload);

    if (data.conversationComplete && data.submissionData) {
      setSubmissionData(data.submissionData);
      setActiveFields(null);
      try {
        await fetch("/api/complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ submissionData: data.submissionData, sessionId: sessionId.current }),
        });
      } catch (err) { console.error("Completion webhook failed:", err); }
      setIsComplete(true);
      localStorage.removeItem(SESSION_KEY);
    } else {
      const turn = aiTurnCount.current;
      aiTurnCount.current += 1;
      maybeShowNextCard(turn);
    }
  }, [maybeShowNextCard]);

  const sendMessage = useCallback(async (text, meta) => {
    if (isLoading || isComplete) return;
    setActiveFields(null);
    setMessages((prev) => [...prev, { role: "user", text }]);
    if (meta?.partial) {
      fetch("/api/partial", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: sessionId.current, ...meta.partial }),
      }).catch(() => {});
    }
    setIsLoading(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: sessionId.current, message: text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Chat request failed");
      await handleResponse(data);
    } catch (err) {
      console.error("Chat error:", err);
      setMessages((prev) => [...prev, { role: "assistant", text: "I'm having trouble connecting right now. Please try again." }]);
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, isComplete, handleResponse]);

  const sendImage = useCallback(async (file, caption) => {
    setUploadPrompted(false);
    if (isLoading || isComplete) return;
    setIsLoading(true);
    const previewUrl = URL.createObjectURL(file);
    setMessages((prev) => [...prev, { role: "user", imageUrl: previewUrl, text: caption || undefined }]);
    try {
      const formData = new FormData();
      formData.append("image", file);
      formData.append("sessionId", sessionId.current);
      const uploadRes = await fetch("/api/upload", { method: "POST", body: formData });
      const uploadData = await uploadRes.json();
      if (!uploadRes.ok) throw new Error(uploadData.error || "Upload failed");
      const analysisNote = uploadData.analysis ? ` Vision analysis: ${uploadData.analysis}` : "";
      const captionNote = caption ? ` Client said: "${caption}"` : "";
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: sessionId.current,
          message: `[Client uploaded an inspiration image: ${uploadData.url}.${analysisNote}${captionNote}]`,
          imageUrl: uploadData.url,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Chat request failed");
      await handleResponse(data);
    } catch (err) {
      console.error("Image upload error:", err);
      setMessages((prev) => [...prev, { role: "assistant", text: "Sorry, I had trouble with that image. Try again or describe what you're looking for." }]);
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, isComplete, handleResponse]);

  const startConversation = useCallback(async () => {
    if (hasGreeted.current) return;
    hasGreeted.current = true;
    setIsLoading(true);
    fetch("/api/plans").then(r => r.json()).then(plans => { window._floorPlans = plans; }).catch(() => {});
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: sessionId.current, message: "Hello" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to start");
      setMessages([{ role: "assistant", text: data.message }]);
      setActiveFields(FIELD_STEPS[0].fields);
      aiTurnCount.current = 1;
    } catch (err) {
      setMessages([{ role: "assistant", text: "Hi! I'm the Barnhaus Design Concierge. What's your name and best email?" }]);
      setActiveFields(FIELD_STEPS[0].fields);
      aiTurnCount.current = 1;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const dismissFields = useCallback(() => setActiveFields(null), []);

  return { messages, isLoading, isComplete, submissionData, activeFields, dismissFields, uploadPrompted, sendMessage, sendImage, startConversation };
}
