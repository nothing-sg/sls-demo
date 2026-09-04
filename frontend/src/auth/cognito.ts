import { Amplify } from "aws-amplify";
import {
  confirmSignIn,
  fetchAuthSession,
  signIn as amplifySignIn,
  signOut as amplifySignOut,
  type AuthSession,
} from "aws-amplify/auth";

// Staff accounts are provisioned by an admin (`aws cognito-idp
// admin-create-user`), never self-signup — see ADR-0004 and
// infra/modules/api.yaml. AdminCreateUser puts new users in
// FORCE_CHANGE_PASSWORD status, so the first sign-in always needs the
// CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED step below; there is no
// self-service registration UI.
//
// Uses AWS Amplify's Auth module (`aws-amplify/auth`), not
// amazon-cognito-identity-js — see ADR-0006. Production still authenticates
// with the default SRP (USER_SRP_AUTH) flow; only the client library
// issuing the same protocol changed.

export type LocalAuthOverride =
  | { userPoolEndpoint: string; authFlowType: "USER_PASSWORD_AUTH" }
  | Record<string, never>;

/** The one config-selection seam this feature (ADR-0007) depends on: whether
 * `VITE_COGNITO_LOCAL_ENDPOINT` is set decides both the Amplify
 * `userPoolEndpoint` override and the sign-in auth flow, in one place.
 *
 * `localEndpoint` set (by `make auth-run` — see local/cognito/README.md):
 * routes Amplify at the local `cognito-local` server, and issues sign-in
 * with `USER_PASSWORD_AUTH` — the only flow `cognito-local` supports; it
 * cannot emulate `USER_SRP_AUTH` at all.
 *
 * `localEndpoint` unset (production, and any `.env.local` deliberately
 * pointed at a real deployed pool): returns `{}`, so callers pass no
 * `userPoolEndpoint` / `authFlowType` overrides at all — Amplify's own
 * defaults (real endpoint, SRP) apply exactly as they did before this
 * feature existed. This is the one part of the whole feature required to
 * have zero effect on anyone not opting into local mode.
 *
 * Pure, no I/O — takes the env value as a parameter rather than reading
 * `import.meta.env` itself, so it's directly unit-testable (see
 * cognito.test.ts) without mocking Vite's env injection.
 */
export function resolveLocalAuthOverride(localEndpoint: string | undefined): LocalAuthOverride {
  if (!localEndpoint) return {};
  return { userPoolEndpoint: localEndpoint, authFlowType: "USER_PASSWORD_AUTH" };
}

let configured = false;

function configureAmplify(): void {
  if (configured) return;

  const userPoolId = import.meta.env.VITE_COGNITO_USER_POOL_ID;
  const userPoolClientId = import.meta.env.VITE_COGNITO_CLIENT_ID;
  if (!userPoolId || !userPoolClientId) {
    throw new Error(
      "VITE_COGNITO_USER_POOL_ID / VITE_COGNITO_CLIENT_ID are not set — copy them from `sam deploy`'s outputs (see infra/modules/api.yaml) into frontend/.env.local.",
    );
  }

  const { userPoolEndpoint } = resolveLocalAuthOverride(import.meta.env.VITE_COGNITO_LOCAL_ENDPOINT);

  Amplify.configure({
    Auth: {
      Cognito: {
        userPoolId,
        userPoolClientId,
        ...(userPoolEndpoint ? { userPoolEndpoint } : {}),
      },
    },
  });
  configured = true;
}

export type SignInResult =
  | { status: "signedIn"; session: AuthSession }
  | { status: "newPasswordRequired" };

export async function signIn(username: string, password: string): Promise<SignInResult> {
  configureAmplify();
  const { authFlowType } = resolveLocalAuthOverride(import.meta.env.VITE_COGNITO_LOCAL_ENDPOINT);
  const { isSignedIn, nextStep } = await amplifySignIn({
    username,
    password,
    ...(authFlowType ? { options: { authFlowType } } : {}),
  });
  if (isSignedIn) {
    return { status: "signedIn", session: await fetchAuthSession() };
  }
  if (nextStep.signInStep === "CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED") {
    return { status: "newPasswordRequired" };
  }
  throw new Error(`Unsupported sign-in challenge: ${nextStep.signInStep}`);
}

// Amplify tracks the pending challenge internally (keyed to the in-flight
// signIn() call) — unlike amazon-cognito-identity-js, there's no CognitoUser
// handle to thread back through the caller.
export async function completeNewPassword(newPassword: string): Promise<AuthSession> {
  const { isSignedIn, nextStep } = await confirmSignIn({ challengeResponse: newPassword });
  if (!isSignedIn) {
    throw new Error(`Unsupported sign-in challenge: ${nextStep.signInStep}`);
  }
  return fetchAuthSession();
}

/** Restores a session from Amplify's own cached tokens, refreshing them
 * first if expired (fetchAuthSession() does this internally). Returns null
 * if no user is signed in or the refresh token itself is no longer valid.
 *
 * `async` deliberately, even though `configureAmplify()` is the only
 * synchronous call in the body: it throws synchronously when
 * VITE_COGNITO_* isn't set, and callers expect a rejected promise here, not
 * an exception escaping a function that returns Promise<...> — same fix
 * ADR-0005 documents verifying live against amazon-cognito-identity-js; an
 * unguarded synchronous throw crashed AuthProvider's effect with a blank
 * page instead of falling back to signed-out.
 */
export async function getCurrentSession(): Promise<AuthSession | null> {
  configureAmplify();
  const session = await fetchAuthSession();
  return session.tokens ? session : null;
}

export function signOut(): Promise<void> {
  return amplifySignOut();
}
