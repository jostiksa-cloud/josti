import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  // Production is mounted at https://josti.vercel.app/admin via Vercel services routing.
  // Local `vite`/`vite preview` keep root `/` for developer convenience.
  base: process.env.VERCEL ? "/admin/" : "/",
  plugins: [react()],
  resolve: {
    alias: {
      "@josti/contracts": fileURLToPath(new URL("../packages/contracts/src/index.ts", import.meta.url)),
      "@josti/ui": fileURLToPath(new URL("../packages/ui/src", import.meta.url)),
    },
  },
  server: {
    port: 5174,
    proxy: { "/api": "http://127.0.0.1:3000" },
  },
});
