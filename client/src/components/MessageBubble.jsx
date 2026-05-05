import React from "react";
import FloorPlanCard from "./FloorPlanCard.jsx";

const styles = {
  row: {
    display: "flex",
    gap: 8,
    padding: "4px 20px",
    maxWidth: "100%",
  },
  userRow: {
    justifyContent: "flex-end",
  },
  assistantRow: {
    justifyContent: "flex-start",
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
    marginTop: 4,
    color: "#1a1a1a",
  },
  bubble: {
    maxWidth: "75%",
    padding: "12px 18px",
    borderRadius: 18,
    fontSize: 15,
    lineHeight: 1.5,
    wordBreak: "break-word",
  },
  userBubble: {
    background: "linear-gradient(135deg, #B8860B, #DAA520)",
    color: "#1a1a1a",
    borderRadius: "18px 18px 4px 18px",
    fontWeight: 500,
  },
  assistantBubble: {
    background: "#2a2a2a",
    color: "#f0f0f0",
    borderRadius: "18px 18px 18px 4px",
  },
  plansContainer: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    marginLeft: 40,
    padding: "0 20px",
  },
};

export default function MessageBubble({ message }) {
  const isUser = message.role === "user";
  const plans = message.suggestedPlans || [];

  return (
    <>
      <div
        style={{
          ...styles.row,
          ...(isUser ? styles.userRow : styles.assistantRow),
        }}
      >
        {!isUser && <div style={styles.avatar}>B</div>}
        <div
          style={{
            ...styles.bubble,
            ...(isUser ? styles.userBubble : styles.assistantBubble),
            ...(message.imageUrl ? { padding: 4, background: "transparent", border: "none" } : {}),
          }}
        >
          {message.imageUrl ? (
            <img
              src={message.imageUrl}
              alt="Uploaded"
              style={{ maxWidth: 240, maxHeight: 200, borderRadius: 10, display: "block" }}
            />
          ) : message.text}
        </div>
      </div>
      {plans.length > 0 && (
        <div style={styles.plansContainer}>
          {plans.map((plan) => (
            <FloorPlanCard key={plan.id} plan={plan} />
          ))}
        </div>
      )}
    </>
  );
}
