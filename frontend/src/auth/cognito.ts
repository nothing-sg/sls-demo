import {
  AuthenticationDetails,
  CognitoUser,
  CognitoUserAttribute,
  CognitoUserPool,
  type CognitoUserSession,
} from "amazon-cognito-identity-js";

// Staff accounts are provisioned by an admin (`aws cognito-idp
// admin-create-user`), never self-signup — see ADR-0004 and
// infra/modules/api.yaml. AdminCreateUser puts new users in
// FORCE_CHANGE_PASSWORD status, so the first sign-in always needs the
// newPasswordRequired step below; there is no self-service registration UI.

let pool: CognitoUserPool | null = null;

function getUserPool(): CognitoUserPool {
  if (pool) return pool;

  const userPoolId = import.meta.env.VITE_COGNITO_USER_POOL_ID;
  const clientId = import.meta.env.VITE_COGNITO_CLIENT_ID;
  if (!userPoolId || !clientId) {
    throw new Error(
      "VITE_COGNITO_USER_POOL_ID / VITE_COGNITO_CLIENT_ID are not set — copy them from `sam deploy`'s outputs (see infra/modules/api.yaml) into frontend/.env.local.",
    );
  }

  pool = new CognitoUserPool({ UserPoolId: userPoolId, ClientId: clientId });
  return pool;
}

export type SignInResult =
  | { status: "signedIn"; session: CognitoUserSession }
  | { status: "newPasswordRequired"; user: CognitoUser };

export function signIn(username: string, password: string): Promise<SignInResult> {
  const user = new CognitoUser({ Username: username, Pool: getUserPool() });
  const authDetails = new AuthenticationDetails({ Username: username, Password: password });

  return new Promise((resolve, reject) => {
    user.authenticateUser(authDetails, {
      onSuccess: (session) => resolve({ status: "signedIn", session }),
      onFailure: (err: unknown) => reject(err),
      newPasswordRequired: () => resolve({ status: "newPasswordRequired", user }),
    });
  });
}

export function completeNewPassword(
  user: CognitoUser,
  newPassword: string,
): Promise<CognitoUserSession> {
  return new Promise((resolve, reject) => {
    user.completeNewPasswordChallenge(
      newPassword,
      {},
      {
        onSuccess: (session) => resolve(session),
        onFailure: (err: unknown) => reject(err),
      },
    );
  });
}

/** Restores a session from the pool's own localStorage-cached user, refreshing
 * it first if the cached access/id tokens have expired. Returns null if no
 * user is cached or the refresh token itself is no longer valid.
 *
 * `async` deliberately, even though the body has no `await`: getUserPool()
 * throws synchronously when VITE_COGNITO_* isn't set, and callers expect a
 * rejected promise here, not an exception escaping a function that returns
 * Promise<...> — verified live, an unguarded synchronous throw from this
 * crashed AuthProvider's effect with a blank page instead of falling back
 * to signed-out.
 */
export async function getCurrentSession(): Promise<CognitoUserSession | null> {
  const user = getUserPool().getCurrentUser();
  if (!user) return Promise.resolve(null);

  return new Promise((resolve) => {
    user.getSession((err: Error | null, session: CognitoUserSession | null) => {
      if (err || !session) {
        resolve(null);
        return;
      }
      if (session.isValid()) {
        resolve(session);
        return;
      }
      user.refreshSession(session.getRefreshToken(), (refreshErr, refreshedSession) => {
        resolve(refreshErr ? null : refreshedSession);
      });
    });
  });
}

export function signOut(): void {
  getUserPool().getCurrentUser()?.signOut();
}

// Exported for a future admin "create user" flow — not wired to any UI yet,
// since user provisioning happens out-of-band (see the note at the top).
export function buildRoleAttribute(role: string): CognitoUserAttribute {
  return new CognitoUserAttribute({ Name: "custom:role", Value: role });
}
