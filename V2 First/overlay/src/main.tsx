import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/overlay.css";

// Deliberate StrictMode: surfaces double-mount/socket-leak bugs in dev.
// useOverlaySocket is written to be idempotent across the mount/unmount cycle.
ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
