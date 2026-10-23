import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/index.css";

const root = document.getElementById("root");
if (!root) throw new Error("Motion Studio: missing #root element");

createRoot(root).render(
  <StrictMode>
    <div className="h-screen bg-background text-foreground">Motion Studio</div>
  </StrictMode>,
);
