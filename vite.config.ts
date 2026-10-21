import { defineConfig } from "vite";

export default defineConfig({
  // Path relatif supaya hasil build bisa dibuka offline dari folder mana pun.
  base: "./",
  server: { port: 5173 },
  build: { target: "es2022", chunkSizeWarningLimit: 8000 },
});
