import React from "react";

const styles = {
  card: {
    background: "#2a2a2a",
    borderRadius: 12,
    overflow: "hidden",
    border: "1px solid #3a3a3a",
    maxWidth: 320,
    marginTop: 8,
    marginBottom: 4,
    transition: "border-color 0.2s",
  },
  image: {
    width: "100%",
    height: 180,
    objectFit: "cover",
    display: "block",
    background: "#1a1a1a",
  },
  body: {
    padding: "14px 16px",
  },
  title: {
    fontSize: 16,
    fontWeight: 600,
    marginBottom: 6,
    color: "#fff",
    fontFamily: "'Inter', sans-serif",
  },
  specs: {
    fontSize: 13,
    color: "#aaa",
    marginBottom: 12,
    fontFamily: "'Inter', sans-serif",
  },
  button: {
    display: "inline-block",
    padding: "8px 20px",
    background: "linear-gradient(135deg, #B8860B, #DAA520)",
    color: "#1a1a1a",
    borderRadius: 6,
    textDecoration: "none",
    fontSize: 13,
    fontWeight: 600,
    letterSpacing: "0.02em",
    fontFamily: "'Inter', sans-serif",
    transition: "opacity 0.2s",
  },
};

export default function FloorPlanCard({ plan }) {
  // Link to DesignVault archive page with scroll to plan
  const planUrl = `https://designvault.barnhaussteelbuilders.com/?plan=${plan.id}`;

  return (
    <div
      style={styles.card}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#B8860B")}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#3a3a3a")}
    >
      {plan.image_url && (
        <img
          src={plan.image_url}
          alt={plan.title}
          style={styles.image}
          onError={(e) => (e.target.style.display = "none")}
        />
      )}
      <div style={styles.body}>
        <div style={styles.title}>{plan.title}</div>
        <div style={styles.specs}>
          {plan.area && `${plan.area.toLocaleString()} sqft`}
          {plan.beds && ` · ${plan.beds} bed`}
          {plan.baths && ` · ${plan.baths} bath`}
        </div>
        <a
          href={planUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={styles.button}
          onMouseEnter={(e) => (e.target.style.opacity = "0.85")}
          onMouseLeave={(e) => (e.target.style.opacity = "1")}
        >
          View Plan
        </a>
      </div>
    </div>
  );
}
