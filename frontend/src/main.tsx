import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./beginner.css";
import BeginnerApp from "./BeginnerApp";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BeginnerApp />
  </StrictMode>,
);
