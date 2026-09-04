import { fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
/// <reference types="vitest/config" />
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Historically needed for amazon-cognito-identity-js's crypto dependencies
  // (jsbn/asn1.js), which referenced the Node.js `global` object at
  // module-load time and crashed with "global is not defined" under Vite
  // (unlike webpack, Vite doesn't polyfill Node globals) — see ADR-0005.
  // aws-amplify (ADR-0006) only guards `typeof global`, so this is no longer
  // strictly required, but it's zero-cost and keeps those guards resolving
  // the same way they would under Node/webpack, so it stays.
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
    // aws-amplify's Auth module (ADR-0006) — AuthProvider needs it
    // synchronously on boot to restore a cached session — dynamic-importing
    // it too would work, but isn't worth the added complexity for a
    // single-page internal tool at this size. Bumped from 600 to 650: the
    // Amplify swap measured at 607.80 kB / 191.45 kB gzip (was ~571 kB /
    // ~183 kB gzip under amazon-cognito-identity-js), a real, verified
    // increase despite Amplify's stated per-module tree-shaking — see
    // ADR-0006's Consequences. Revisit if this bundle needs a tighter
    // budget later.
    chunkSizeWarningLimit: 650,
  },
  test: {
    environment: "node",
  },
});
