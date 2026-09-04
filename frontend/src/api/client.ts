// Thin fetch wrapper. Once the backend is running, `npm run gen:api`
// generates `schema.d.ts` from its OpenAPI document (see ADR-0003) — swap
// this for an `openapi-fetch` client typed against that schema.
const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (!response.ok) {
    throw new ApiError(response.status, await response.text());
  }

  return response.json() as Promise<T>;
}
