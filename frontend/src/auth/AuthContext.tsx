import type { CognitoUser, CognitoUserSession } from "amazon-cognito-identity-js";
import { createContext, useContext, useEffect, useMemo, useState } from "react";

import * as cognito from "@/auth/cognito";
import { setToken } from "@/auth/tokenStore";

// Mirrors backend/src/shared/auth.py Role — keep in sync (see ADR-0004).
export type Role = "admin" | "clinic_ops";

export interface CurrentUser {
  subject: string;
  role: Role | null;
}

type AuthState =
  | { status: "loading" }
  | { status: "signedOut" }
  | { status: "newPasswordRequired"; pendingUser: CognitoUser }
  | { status: "signedIn"; user: CurrentUser };

interface AuthContextValue {
  state: AuthState;
  signIn: (username: string, password: string) => Promise<void>;
  completeNewPassword: (newPassword: string) => Promise<void>;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function userFromSession(session: CognitoUserSession): CurrentUser {
  const claims = session.getIdToken().decodePayload() as Record<string, unknown>;
  const rawRole = claims["custom:role"];
  const role: Role | null = rawRole === "admin" || rawRole === "clinic_ops" ? rawRole : null;
  return { subject: String(claims["sub"]), role };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    cognito
      .getCurrentSession()
      .then((session) => {
        if (cancelled) return;
        if (session) {
          setToken(session.getIdToken().getJwtToken());
          setState({ status: "signedIn", user: userFromSession(session) });
        } else {
          setToken(null);
          setState({ status: "signedOut" });
        }
      })
      .catch(() => {
        // No cached session to restore, or Cognito isn't configured yet
        // (see cognito.ts) — either way, fall back to signed-out rather than
        // crash. If it's a config problem, the same error resurfaces from
        // the sign-in form itself, where it's actionable.
        if (cancelled) return;
        setToken(null);
        setState({ status: "signedOut" });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      state,
      async signIn(username, password) {
        const result = await cognito.signIn(username, password);
        if (result.status === "newPasswordRequired") {
          setState({ status: "newPasswordRequired", pendingUser: result.user });
          return;
        }
        setToken(result.session.getIdToken().getJwtToken());
        setState({ status: "signedIn", user: userFromSession(result.session) });
      },
      async completeNewPassword(newPassword) {
        if (state.status !== "newPasswordRequired") {
          throw new Error("completeNewPassword called with no pending challenge");
        }
        const session = await cognito.completeNewPassword(state.pendingUser, newPassword);
        setToken(session.getIdToken().getJwtToken());
        setState({ status: "signedIn", user: userFromSession(session) });
      },
      signOut() {
        cognito.signOut();
        setToken(null);
        setState({ status: "signedOut" });
      },
    }),
    [state],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
