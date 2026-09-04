import { beforeEach, describe, expect, it, vi } from "vitest";

import { getToken, setToken, subscribeToken } from "./tokenStore";

describe("tokenStore", () => {
  beforeEach(() => {
    setToken(null);
  });

  it("starts with no token", () => {
    expect(getToken()).toBeNull();
  });

  it("returns the most recently set token", () => {
    setToken("abc.def.ghi");
    expect(getToken()).toBe("abc.def.ghi");
  });

  it("notifies subscribers on every change, including clearing", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToken(listener);

    setToken("token-1");
    setToken(null);

    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
  });

  it("stops notifying after unsubscribe", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToken(listener);
    unsubscribe();

    setToken("token-2");

    expect(listener).not.toHaveBeenCalled();
  });
});
