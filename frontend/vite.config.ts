import { fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
/// <reference types="vitest/config" />
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // amazon-cognito-identity-js's crypto dependencies (jsbn/asn1.js) reference
  // the Node.js `global` object at module-load time; unlike webpack, Vite
  // doesn't polyfill Node globals, so without this the app throws
  // "global is not defined" and never renders — verified live in a browser.
  define: {
    global: "globalThis",
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
  build: {
    // Route-level code splitting (see App.tsx's React.lazy pages) already
    // handles the split-able weight. What's left in the main chunk is
    // amazon-cognito-identity-js's SRP/crypto math, which AuthProvider needs
    // synchronously on boot to restore a cached session — dynamic-importing
    // it too would work, but isn't worth the added complexity for a
    // single-page internal tool at this size. Revisit if this bundle needs
    // a tighter budget later.
    chunkSizeWarningLimit: 600,
  },
  test: {
    environment: "node",
  },
});
