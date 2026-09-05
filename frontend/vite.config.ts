import { fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
/// <reference types="vitest/config" />
import { defineConfig } from "vitest/config";

// `make frontend-run-public` (local/ngrok/frontendRunPublic.mjs) sets this to
// the *exact* current ngrok "frontend" tunnel hostname (e.g.
// "abcd1234.ngrok-free.app", no scheme, no path) and re-execs `npm run dev`
// with it in the environment, after confirming that tunnel is up and gating
// it with fresh Basic Auth -- see that file for the full flow. Plain
// `make frontend-run` never sets this, so `host`/`allowedHosts` stay at
// Vite's defaults (bind to localhost only) exactly as before this feature.
//
// This MUST be an exact hostname, never a leading-dot suffix pattern: unlike
// Tailscale's `.ts.net` (a private namespace scoped to one tailnet, safe as a
// wildcard), ngrok's free-tier domains (`*.ngrok-free.app`) are a shared
// public suffix used by every ngrok account -- a suffix wildcard here would
// accept a `Host` header claiming to be anyone else's unrelated ngrok
// tunnel, not just this one. Vite's own allowedHosts matching (see
// `isHostAllowedWithoutCache` in vite/dist/node/chunks/*.js) only treats a
// *leading-dot* entry as a suffix match; a bare hostname string is an exact
// match, which is what's used here.
const publicTunnelHost = process.env.NGROK_FRONTEND_HOST;

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
    host: publicTunnelHost ? true : undefined,
    allowedHosts: publicTunnelHost ? [publicTunnelHost] : undefined,
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
