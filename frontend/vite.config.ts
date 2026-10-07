import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    include: ["xlsx-js-style", "papaparse", "oidc-client-ts", "idb"],
  },
  server: {
    proxy: {
      "/api/license": "http://localhost:8081",
      "/api": "http://localhost:8080",
    },
  },
});
