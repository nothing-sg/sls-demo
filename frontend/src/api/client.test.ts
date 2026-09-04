import { describe, expect, it } from "vitest";

import { ApiError, unwrap } from "./client";

function fakeResponse(status: number): Response {
  return new Response(null, { status, statusText: "Test Status" });
}

describe("unwrap", () => {
  it("returns data on success", async () => {
    const result = unwrap(
      Promise.resolve({ data: { id: "1" }, error: undefined, response: fakeResponse(200) }),
    );
    await expect(result).resolves.toEqual({ id: "1" });
  });

  it("throws ApiError with the backend's detail message when present", async () => {
    // Matches FastAPI's default HTTPException body shape — see
    // backend HTTPException(status, "message") calls, e.g. patients/api.py.
    const result = unwrap(
      Promise.resolve({
        data: undefined,
        error: { detail: "Patient not found" },
        response: fakeResponse(404),
      }),
    );
    await expect(result).rejects.toMatchObject(
      new ApiError(404, "Patient not found"),
    );
  });

  it("falls back to statusText when the error body has no string detail", async () => {
    const result = unwrap(
      Promise.resolve({ data: undefined, error: {}, response: fakeResponse(500) }),
    );
    await expect(result).rejects.toMatchObject(new ApiError(500, "Test Status"));
  });

  it("throws if data is missing without an explicit error (unexpected empty body)", async () => {
    const result = unwrap(
      Promise.resolve({ data: undefined, error: undefined, response: fakeResponse(200) }),
    );
    await expect(result).rejects.toThrow(ApiError);
  });
});
