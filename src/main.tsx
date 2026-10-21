import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

// Sin menu contextual del webview (Open Link, Inspect Element...), salvo en campos de texto para poder pegar y copiar.
document.addEventListener("contextmenu", (event) => {
  const target = event.target;
  if (target instanceof Element && target.closest("input, textarea, [contenteditable='true']")) return;
  event.preventDefault();
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
