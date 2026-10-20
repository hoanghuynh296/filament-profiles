import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Dev: UI on :5180 with hot reload, API + images proxied to server.py (EDITOR_PORT, default 8090).
const backend = `http://127.0.0.1:${process.env.EDITOR_PORT || 8090}`;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5180,
    host: true,
    proxy: { "/api": backend, "/images": backend },
  },
  build: { outDir: "dist", emptyOutDir: true },
});
