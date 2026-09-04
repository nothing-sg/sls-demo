import createClient from "openapi-fetch";

import { getToken } from "@/auth/tokenStore";

import type { paths } from "./schema";

export const apiClient = createClient<paths>({
  baseUrl: import.meta.env.VITE_API_BASE_URL ?? "/api",
});

apiClient.use({
  onRequest({ request }) {
    const token = getToken();
    if (token) {
      request.headers.set("Authorization", `Bearer ${token}`);
    }
    return request;
  },
});

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Unwraps an openapi-fetch response, throwing ApiError for any non-2xx.
 * FastAPI's default exception handler always shapes error bodies as
 * `{"detail": "..."}` (see backend HTTPException(...) calls), including for
 * statuses (401/403/404) the OpenAPI schema doesn't document per-operation —
 * openapi-fetch still parses the body, just without a precise type for it.
 */
export async function unwrap<T>(
  result: Promise<{ data?: T; error?: unknown; response: Response }>,
): Promise<T> {
  const { data, error, response } = await result;
  if (error !== undefined) {
    const detail =
      typeof error === "object" && error !== null && "detail" in error
        ? (error as { detail: unknown }).detail
        : undefined;
    const message =
      typeof detail === "string" ? detail : (response.statusText ?? "Request failed");
    throw new ApiError(response.status, message);
  }
  if (data === undefined) {
    throw new ApiError(response.status, "Empty response body");
  }
  return data;
}
