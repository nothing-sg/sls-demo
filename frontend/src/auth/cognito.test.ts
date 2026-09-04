import { describe, expect, it } from "vitest";

import { resolveLocalAuthOverride } from "./cognito";

describe("resolveLocalAuthOverride", () => {
  it("returns no overrides when VITE_COGNITO_LOCAL_ENDPOINT is unset", () => {
    // Must be byte-for-byte production behavior (ADR-0007): no
    // userPoolEndpoint, no authFlowType override, so Amplify's own
    // defaults (real endpoint, SRP) apply untouched.
    expect(resolveLocalAuthOverride(undefined)).toEqual({});
  });

  it("returns no overrides for an empty-string value", () => {
    // Matches `frontend/.env.example`'s documented empty-by-default state
    // for this var.
    expect(resolveLocalAuthOverride("")).toEqual({});
  });

  it("returns the local endpoint and USER_PASSWORD_AUTH when set", () => {
    // cognito-local cannot emulate USER_SRP_AUTH at all (see
    // local/cognito/README.md) -- USER_PASSWORD_AUTH is the only flow that
    // works against it.
    expect(resolveLocalAuthOverride("http://localhost:9229")).toEqual({
      userPoolEndpoint: "http://localhost:9229",
      authFlowType: "USER_PASSWORD_AUTH",
    });
  });
});
