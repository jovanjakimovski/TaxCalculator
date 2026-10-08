import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./portal.css";
import Portal from "./Portal";
import "./brand.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Portal />
  </StrictMode>,
);
