import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

export default defineConfig({
  root: "client",
  base: "./",
  define: {
    __SERVER_URL__: JSON.stringify(process.env.SERVER_URL || "localhost:2567"),
  },
  resolve: {
    alias: {
      "@shared": fileURLToPath(new URL("./shared", import.meta.url)),
    },
  },
  server: {
    port: 8080,
  },
  build: {
    outDir: "../public",
    emptyOutDir: true,
  },
});
