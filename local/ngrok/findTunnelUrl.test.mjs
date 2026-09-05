import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { findTunnelUrl } from "./findTunnelUrl.mjs";

// Fixture-driven, mirroring frontend/src/auth/cognito.test.ts's style: real
// (or realistically-shaped) ngrok API payloads in, a plain assertion out.
// The "up tunnel" fixture's field names (name/public_url/proto/config.addr)
// match both this repo's own empirical probe of a running (tunnel-less)
// ngrok agent and ngrok's published API docs -- see findTunnelUrl.mjs's
// top-of-file comment for exactly what was and wasn't verified live.

const upTunnelsResponse = {
  tunnels: [
    {
      name: "frontend",
      uri: "/api/tunnels/frontend",
      public_url: "https://abcd1234.ngrok-free.app",
      proto: "https",
      config: { addr: "http://localhost:5173", inspect: true },
    },
    {
      name: "cognito-local",
      uri: "/api/tunnels/cognito-local",
      public_url: "https://wxyz9876.ngrok-free.app",
      proto: "https",
      config: { addr: "http://localhost:9229", inspect: true },
    },
  ],
  uri: "/api/tunnels",
};

describe("findTunnelUrl", () => {
  it("returns the public URL when the named tunnel is present and up", () => {
    assert.deepEqual(findTunnelUrl(upTunnelsResponse, "frontend"), {
      status: "found",
      url: "https://abcd1234.ngrok-free.app",
    });
    assert.deepEqual(findTunnelUrl(upTunnelsResponse, "cognito-local"), {
      status: "found",
      url: "https://wxyz9876.ngrok-free.app",
    });
  });

  it("returns not_found when the named tunnel is absent from the response", () => {
    const result = findTunnelUrl(upTunnelsResponse, "some-other-tunnel");
    assert.equal(result.status, "not_found");
    assert.match(result.reason, /no tunnel named "some-other-tunnel"/);
    assert.match(result.reason, /frontend/);
    assert.match(result.reason, /cognito-local/);
  });

  it("returns not_found for an empty tunnels list (ngrok up, nothing started yet)", () => {
    // This exact shape -- {"tunnels":[],"uri":"/api/tunnels"} -- was observed
    // live against a real (unauthenticated) ngrok agent's local API.
    const result = findTunnelUrl({ tunnels: [], uri: "/api/tunnels" }, "frontend");
    assert.equal(result.status, "not_found");
    assert.match(result.reason, /zero tunnels/);
  });

  it("returns not_found for a malformed response missing the tunnels array", () => {
    const result = findTunnelUrl({ uri: "/api/tunnels" }, "frontend");
    assert.equal(result.status, "not_found");
    assert.match(result.reason, /no "tunnels" array/);
  });

  it("returns not_found for a completely empty/undefined response", () => {
    assert.equal(findTunnelUrl(undefined, "frontend").status, "not_found");
    assert.equal(findTunnelUrl(null, "frontend").status, "not_found");
    assert.equal(findTunnelUrl({}, "frontend").status, "not_found");
  });

  it("returns not_found when the named tunnel is present but has no public_url yet", () => {
    const stillConnecting = {
      tunnels: [{ name: "frontend", config: { addr: "http://localhost:5173" } }],
      uri: "/api/tunnels",
    };
    const result = findTunnelUrl(stillConnecting, "frontend");
    assert.equal(result.status, "not_found");
    assert.match(result.reason, /no public_url yet/);
  });
});
