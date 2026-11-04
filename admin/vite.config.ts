import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

const nestedAdmin =
  Boolean(process.env.VERCEL || process.env.VERCEL_ENV) ||
  process.env.ADMIN_BASE === "/admin/";

export default defineConfig({
  // Production admin is served from the web service at /admin/*.
  // Local `vite`/`vite preview` keep root `/` for developer convenience.
  base: nestedAdmin ? "/admin/" : "/",
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
