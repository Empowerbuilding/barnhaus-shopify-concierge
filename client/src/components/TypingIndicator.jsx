import React from "react";

const styles = {
  wrapper: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "12px 20px",
    maxWidth: "80%",
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: "50%",
    background: "linear-gradient(135deg, #B8860B, #DAA520)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 14,
    fontWeight: 700,
    flexShrink: 0,
  },
  bubble: {
    background: "#2a2a2a",
    borderRadius: "18px 18px 18px 4px",
    padding: "14px 20px",
    display: "flex",
    gap: 5,
    alignItems: "center",
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
    background: "#888",
  },
};

const keyframes = `
@keyframes typingBounce {
  0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
  30% { transform: translateY(-6px); opacity: 1; }
}`;

export default function TypingIndicator() {
  return (
    <>
      <style>{keyframes}</style>
      <div style={styles.wrapper}>
        <div style={styles.avatar}>B</div>
        <div style={styles.bubble}>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              style={{
                ...styles.dot,
                animation: "typingBounce 1.4s infinite",
                animationDelay: `${i * 0.2}s`,
              }}
            />
          ))}
        </div>
      </div>
    </>
  );
}
