import React from "react";
import ChatWindow from "./components/ChatWindow.jsx";

const styles = {
  app: {
    height: "100%",
    width: "100%",
    background: "#1a1a1a",
    display: "flex",
    flexDirection: "column",
  },
};

export default function App() {
  return (
    <div style={styles.app}>
      <ChatWindow />
    </div>
  );
}
