import React, { useEffect, useRef, useState } from "react";
import MessageBubble from "./MessageBubble.jsx";
import TypingIndicator from "./TypingIndicator.jsx";
import { useChat } from "../hooks/useChat.js";
import FloorPlanCard from "./FloorPlanCard.jsx";
import FieldCard from "./FieldCard.jsx";

const LOGO_URL = "https://barnhaussteelbuilders.com/assets/images/logo-BbjiAVC6.png";

// Inject pulse keyframes once
const PULSE_CSS = "@keyframes uploadPulse{0%,100%{box-shadow:0 0 0 0 rgba(184,134,11,0.6);border-color:#B8860B;color:#B8860B}50%{box-shadow:0 0 0 8px rgba(184,134,11,0);border-color:#DAA520;color:#DAA520}}.upload-pulse{animation:uploadPulse 1.4s ease-in-out infinite}";
if (typeof document !== "undefined" && !document.getElementById("upload-pulse-style")) {
  const style = document.createElement("style");
  style.id = "upload-pulse-style";
  style.textContent = PULSE_CSS;
  document.head.appendChild(style);
}

const s = {
  container: { display:"flex", flexDirection:"column", height:"100%", maxWidth:680, margin:"0 auto", overflow:"hidden", width:"100%" },
  header: { padding:"16px 24px", borderBottom:"1px solid #2a2a2a", textAlign:"center", flexShrink:0, background:"#1a1a1a" },
  logoImg: { height:44, width:"auto", display:"block", margin:"0 auto 6px" },
  logoFallback: { fontSize:22, fontWeight:700, color:"#fff", letterSpacing:"0.04em", fontFamily:"'Inter',sans-serif" },
  logoAccent: { color:"#B8860B" },
  subtitle: { fontSize:12, color:"#888", letterSpacing:"0.12em", textTransform:"uppercase", fontFamily:"'Inter',sans-serif", fontWeight:500 },
  messagesArea: { flex:1, overflowY:"auto", padding:"20px 0", display:"flex", flexDirection:"column", gap:12 },
  inputArea: { padding:"16px 20px", borderTop:"1px solid #2a2a2a", flexShrink:0, background:"#1a1a1a", overflow:"hidden", maxWidth:"100%", boxSizing:"border-box" },
  inputRow: { display:"flex", gap:8, alignItems:"center", maxWidth:"100%", overflow:"hidden" },
  input: { flex:1, padding:"14px 18px", borderRadius:24, border:"1px solid #3a3a3a", background:"#222", color:"#fff", fontSize:15, outline:"none", fontFamily:"'Inter',sans-serif", transition:"border-color 0.2s" },
  uploadBtn: { width:46, height:46, borderRadius:"50%", border:"1px solid #3a3a3a", background:"#222", color:"#888", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, transition:"border-color 0.2s, color 0.2s" },
  sendBtn: { width:46, height:46, borderRadius:"50%", border:"none", background:"linear-gradient(135deg,#B8860B,#DAA520)", color:"#1a1a1a", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 },
  sendBtnDisabled: { opacity:0.4, cursor:"not-allowed" },
  hint: { fontSize:11, color:"#555", textAlign:"center", marginTop:8, fontFamily:"'Inter',sans-serif" },
  completeScreen: { display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", flex:1, padding:40, textAlign:"center", gap:16 },
  completeTitle: { fontSize:26, fontWeight:700, color:"#fff", fontFamily:"'Inter',sans-serif" },
  completeText: { fontSize:16, color:"#aaa", lineHeight:1.6, maxWidth:400, fontFamily:"'Inter',sans-serif" },
  completeAccent: { color:"#B8860B", fontWeight:600 },
};

export default function ChatWindow() {
  const { messages, isLoading, isComplete, submissionData, activeFields, dismissFields, uploadPrompted, sendMessage, sendImage, startConversation } = useChat();
  const [input, setInput] = useState("");
  const [pendingImage, setPendingImage] = useState(null); // { file, previewUrl }
  const [logoError, setLogoError] = useState(false);
  const messagesEnd = useRef(null);
  const fileInputRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => { startConversation(); }, [startConversation]);
  useEffect(() => { messagesEnd.current?.scrollIntoView({ behavior:"smooth" }); }, [messages, isLoading]);

  const handleSend = () => {
    const text = input.trim();
    if ((!text && !pendingImage) || isLoading) return;
    setInput("");
    if (pendingImage) {
      const img = pendingImage;
      setPendingImage(null);
      sendImage(img.file, text || undefined);
    } else {
      sendMessage(text);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      const previewUrl = URL.createObjectURL(file);
      setPendingImage({ file, previewUrl });
      e.target.value = "";
      inputRef.current?.focus();
    }
  };

  return (
    <div style={s.container}>
      <div style={s.header}>
        {!logoError
          ? <img src={LOGO_URL} alt="Barnhaus Steel Builders" style={s.logoImg} onError={() => setLogoError(true)} />
          : <div style={s.logoFallback}>BARN<span style={s.logoAccent}>HAUS</span></div>
        }
        <div style={s.subtitle}>Design Concierge</div>
      </div>

      {isComplete ? (
        <div style={{ ...s.completeScreen, justifyContent: "flex-start", overflowY: "auto", paddingTop: 40 }}>
          <div style={{ fontSize:48 }}>✓</div>
          <div style={s.completeTitle}>You're All Set</div>
          <div style={s.completeText}>
            Thank you{submissionData?.name ? `, ${submissionData.name}` : ""}! Your design direction has been submitted.
            Our team lead, <span style={s.completeAccent}>Larry</span>, will reach out within 24 hours.
          </div>
          <div style={{ marginTop:16, padding:"12px 28px", background:"linear-gradient(135deg,#B8860B,#DAA520)", color:"#1a1a1a", borderRadius:8, fontWeight:600, fontSize:14, cursor:"pointer", fontFamily:"'Inter',sans-serif" }}
            onClick={() => window.open("https://barnhaussteelbuilders.com","_blank")}>
            Visit Barnhaus Steel Builders
          </div>
          {submissionData?.suggested_plans?.length > 0 && (
            <div style={{ marginTop:32, width:"100%", maxWidth:520 }}>
              <div style={{ fontSize:13, color:"#888", letterSpacing:"0.08em", textTransform:"uppercase", fontFamily:"'Inter',sans-serif", marginBottom:12, textAlign:"center" }}>
                Designs that match your vision
              </div>
              <div style={{ display:"flex", flexWrap:"wrap", gap:12, justifyContent:"center" }}>
                {submissionData.suggested_plans
                  .map(id => window._floorPlans?.find(p => p.id === id))
                  .filter(Boolean)
                  .map(plan => <FloorPlanCard key={plan.id} plan={plan} />)
                }
              </div>
            </div>
          )}
        </div>
      ) : (
        <>
          <div style={s.messagesArea}>
            {messages.map((msg, i) => <MessageBubble key={i} message={msg} />)}
            {isLoading && <TypingIndicator />}
            <div ref={messagesEnd} />
          </div>
          {activeFields && (
            <div style={{ padding: "0 20px 0" }}>
              <FieldCard
                fields={activeFields}
                onSubmit={(msg, values) => {
                  dismissFields();
                  // If this is the contact card, fire partial lead immediately
                  const isContactCard = activeFields?.some(f => f.key === "email");
                  const meta = isContactCard && values ? { partial: { name: values.name, email: values.email, phone: values.phone } } : undefined;
                  sendMessage(msg, meta);
                }}
                onDismiss={dismissFields}
              />
            </div>
          )}
          <div style={s.inputArea}>
            {pendingImage && (
              <div style={{ display:"flex", alignItems:"center", gap:8, padding:"6px 8px", background:"#1a1a1a", borderRadius:8, marginBottom:6, border:"1px solid #333", maxWidth:"100%", boxSizing:"border-box", overflow:"hidden" }}>
                <img src={pendingImage.previewUrl} style={{ width:48, height:48, objectFit:"cover", borderRadius:6, flexShrink:0 }} />
                <span style={{ fontSize:12, color:"#888", flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>Photo queued — type a caption then hit send</span>
                <button onClick={() => setPendingImage(null)} style={{ background:"none", border:"none", color:"#666", cursor:"pointer", fontSize:16, padding:"0 4px", flexShrink:0 }}>✕</button>
              </div>
            )}
            <div style={s.inputRow}>
              <input ref={fileInputRef} type="file" accept="image/*" style={{ display:"none" }} onChange={handleFileChange} />
              <button
                onClick={() => fileInputRef.current?.click()}
                className={uploadPrompted ? "upload-pulse" : ""}
                style={{ ...s.uploadBtn, ...(uploadPrompted ? { borderColor:"#B8860B", color:"#B8860B" } : {}) }}
                disabled={isLoading}
                title={uploadPrompted ? "Click to upload a photo" : "Upload inspiration image"}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor="#B8860B"; e.currentTarget.style.color="#B8860B"; }}
                onMouseLeave={(e) => { if (!uploadPrompted) { e.currentTarget.style.borderColor="#3a3a3a"; e.currentTarget.style.color="#888"; } }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
                  <polyline points="21 15 16 10 5 21"/>
                </svg>
              </button>
              <input type="text" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={handleKeyDown}
                placeholder="Type your message..." style={s.input}
                onFocus={(e) => (e.target.style.borderColor="#B8860B")}
                onBlur={(e) => (e.target.style.borderColor="#3a3a3a")}
                disabled={isLoading} />
              <button onClick={handleSend}
                style={{ ...s.sendBtn, ...(isLoading || (!input.trim() && !pendingImage) ? s.sendBtnDisabled : {}) }}
                disabled={isLoading || (!input.trim() && !pendingImage)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                </svg>
              </button>
            </div>
            <div style={{ ...s.hint, ...(uploadPrompted ? { color:"#B8860B" } : {}) }}>
              {uploadPrompted ? "📷 Click the photo button to upload" : "📷 Upload inspiration photos or lot images anytime"}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
