import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// In development Vite serves the app and forwards API calls to Django on :8000.
// The production build is served by Django itself under /static/.
export default defineConfig(({ command }) => ({
  base: command === "build" ? "/static/" : "/",
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: { "/api": "http://127.0.0.1:8000", "/admin": "http://127.0.0.1:8000" },
  },
}));
