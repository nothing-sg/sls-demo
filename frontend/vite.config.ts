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
    // Phone testing over Tailscale (ADR-0009): opt-in via PHONE_HOST, set to
    // the developer's Tailscale hostname (e.g. `PHONE_HOST=my-mac.tailnet.ts.net
    // make frontend-run`). Unset (the default), this spreads an empty object
    // and the server block is byte-for-byte what it was before this feature —
    // no `host`, no `allowedHosts`, dev server stays localhost-only.
    ...(process.env.PHONE_HOST
      ? {
          // Bind externally so the phone's browser (reaching this Mac via its
          // Tailscale-assigned interface) can open a TCP connection at all —
          // Vite's default `host` only listens on loopback.
          host: true,
          // Vite 5.4.x's hostCheckMiddleware 403s any request whose Host
          // header isn't an IP literal, localhost, or explicitly allowed
          // here (confirmed by reading node_modules/vite's own
          // isHostAllowedWithoutCache, not assumed from docs). A leading-dot
          // entry matches as a suffix (`hostname.endsWith(allowedHost)`), so
          // this allows any `*.ts.net` Tailscale hostname rather than
          // pinning today's exact device name — a later machine/tailnet
          // rename keeps working without an edit. See ADR-0009.
          allowedHosts: [".ts.net"],
        }
      : {}),
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
