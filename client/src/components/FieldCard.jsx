import React, { useState } from "react";

export default function FieldCard({ fields, onSubmit, onDismiss }) {
  const [values, setValues] = useState(() =>
    Object.fromEntries(fields.map(f => [f.key, f.default || ""]))
  );

  const handleChange = (key, value) => setValues(v => ({ ...v, [key]: value }));

  const handleSubmit = () => {
    const filled = fields.filter(f => values[f.key]?.toString().trim());
    if (!filled.length) return;
    // Build natural message from filled fields
    const parts = filled.map(f => {
      const v = values[f.key];
      if (f.type === "boolean") return v === "yes" ? f.label : null;
      return `${f.label}: ${v}`;
    }).filter(Boolean);
    onSubmit(parts.join(", "), values);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") { e.preventDefault(); handleSubmit(); }
  };

  return (
    <div style={{
      background: "#242424",
      border: "1px solid #B8860B",
      borderRadius: 12,
      padding: "16px 18px",
      marginBottom: 8,
      position: "relative",
    }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
        {fields.map(f => (
          <div key={f.key} style={{ display: "flex", flexDirection: "column", gap: 4, flex: f.flex || "1 1 120px", minWidth: 100 }}>
            <label style={{ fontSize: 11, color: "#B8860B", fontFamily: "'Inter',sans-serif", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" }}>
              {f.label}
            </label>
            {f.type === "select" ? (
              <select
                value={values[f.key]}
                onChange={e => handleChange(f.key, e.target.value)}
                style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #3a3a3a", background: "#1a1a1a", color: "#fff", fontSize: 14, fontFamily: "'Inter',sans-serif", outline: "none" }}
              >
                <option value="">Select...</option>
                {f.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            ) : f.type === "boolean" ? (
              <div style={{ display: "flex", gap: 6 }}>
                {["yes", "no"].map(opt => (
                  <button key={opt} onClick={() => handleChange(f.key, opt)}
                    style={{ flex: 1, padding: "8px 0", borderRadius: 8, border: `1px solid ${values[f.key] === opt ? "#B8860B" : "#3a3a3a"}`, background: values[f.key] === opt ? "#B8860B22" : "#1a1a1a", color: values[f.key] === opt ? "#B8860B" : "#888", fontSize: 13, fontFamily: "'Inter',sans-serif", cursor: "pointer" }}>
                    {opt.charAt(0).toUpperCase() + opt.slice(1)}
                  </button>
                ))}
              </div>
            ) : (
              <input
                type={f.type === "number" ? "number" : "text"}
                placeholder={f.placeholder || ""}
                value={values[f.key]}
                onChange={e => handleChange(f.key, e.target.value)}
                onKeyDown={handleKeyDown}
                style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #3a3a3a", background: "#1a1a1a", color: "#fff", fontSize: 14, fontFamily: "'Inter',sans-serif", outline: "none" }}
              />
            )}
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button onClick={onDismiss}
          style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #3a3a3a", background: "transparent", color: "#666", fontSize: 13, cursor: "pointer", fontFamily: "'Inter',sans-serif" }}>
          Skip
        </button>
        <button onClick={handleSubmit}
          style={{ padding: "8px 20px", borderRadius: 8, border: "none", background: "linear-gradient(135deg,#B8860B,#DAA520)", color: "#1a1a1a", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "'Inter',sans-serif" }}>
          Submit
        </button>
      </div>
    </div>
  );
}
