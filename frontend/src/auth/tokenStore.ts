// Lets the API client (src/api/client.ts, created once at module scope) read
// the current ID token at request time without being re-created whenever
// AuthContext's state changes. AuthContext is the sole writer.
type Listener = () => void;

let currentToken: string | null = null;
const listeners = new Set<Listener>();

export function getToken(): string | null {
  return currentToken;
}

export function setToken(token: string | null): void {
  currentToken = token;
  listeners.forEach((listener) => listener());
}

export function subscribeToken(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
