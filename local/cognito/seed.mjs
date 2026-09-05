// Seeds a fresh cognito-local instance (started by `make auth-run`, which
// always wipes .cognito/ first) with:
//   - a User Pool carrying the `custom:role` schema attribute this app's
//     backend expects (backend/src/shared/auth.py's Role enum, ADR-0004)
//   - a User Pool Client with USER_PASSWORD_AUTH + refresh-token auth
//     enabled (cognito-local cannot emulate USER_SRP_AUTH at all -- see
//     local/cognito/README.md)
//   - local-admin / local-clinic-ops, each with a permanent password and
//     the matching custom:role value
//   - local-new-hire, deliberately left in FORCE_CHANGE_PASSWORD status --
//     empirically confirmed (see README) to produce a real
//     NEW_PASSWORD_REQUIRED challenge from InitiateAuth against
//     cognito-local, so this exercises the app's real first-sign-in screen
//
// Not idempotent by design: it always assumes it's running against a
// freshly-wiped cognito-local instance (that's what `make auth-run` does
// before invoking this script). Re-running it against an already-seeded
// instance will fail with UsernameExistsError.

import { writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CognitoIdentityProviderClient,
  CreateUserPoolCommand,
  CreateUserPoolClientCommand,
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
} from "@aws-sdk/client-cognito-identity-provider";

const LOCAL_ENDPOINT = "http://localhost:9229";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_ENV_LOCAL = path.resolve(__dirname, "../../frontend/.env.local");

// This script's own CognitoIdentityProviderClient (below) always talks to
// cognito-local via LOCAL_ENDPOINT -- it always runs on the same host as the
// cognito-local container (`make auth-run` / `make auth-run-public` both
// start that container locally), so it always reaches it via localhost,
// regardless of how a browser will reach it later. PUBLIC_ENDPOINT is ONLY
// the value written to frontend/.env.local's VITE_COGNITO_LOCAL_ENDPOINT,
// for later browser/Amplify use from wherever the recipient's browser
// actually is. Don't conflate the two.
//
// `make auth-run-public` sets COGNITO_LOCAL_PUBLIC_ENDPOINT to the
// cognito-local ngrok tunnel's current public URL (looked up via
// local/ngrok/lookupTunnel.mjs) before invoking this script. Plain
// `make auth-run` leaves it unset, so PUBLIC_ENDPOINT falls back to
// LOCAL_ENDPOINT and behavior is byte-for-byte unchanged from before this
// distinction existed.
const PUBLIC_ENDPOINT = process.env.COGNITO_LOCAL_PUBLIC_ENDPOINT || LOCAL_ENDPOINT;

const SEED_USERS = {
  admin: {
    username: "local-admin",
    email: "local-admin@example.com",
    role: "admin",
    password: "LocalAdmin123!",
  },
  clinicOps: {
    username: "local-clinic-ops",
    email: "local-clinic-ops@example.com",
    role: "clinic_ops",
    password: "LocalClinicOps123!",
  },
  newHire: {
    username: "local-new-hire",
    email: "local-new-hire@example.com",
    role: "clinic_ops",
    // Only used to get the user created; never usable as a login password --
    // AdminCreateUser without a follow-up AdminSetUserPassword leaves the
    // user in FORCE_CHANGE_PASSWORD, so InitiateAuth immediately returns a
    // NEW_PASSWORD_REQUIRED challenge before this password is ever checked.
    temporaryPassword: "Temp-NewHire-1A!",
  },
};

const client = new CognitoIdentityProviderClient({
  endpoint: LOCAL_ENDPOINT,
  region: "local",
  // cognito-local doesn't validate these, but the AWS SDK requires *some*
  // credentials to be present before it will sign a request.
  credentials: { accessKeyId: "local", secretAccessKey: "local" },
});

async function main() {
  console.log(`Seeding cognito-local at ${LOCAL_ENDPOINT} ...`);

  const { UserPool } = await client.send(
    new CreateUserPoolCommand({
      PoolName: "sls-best-practice-local",
      // MFA off: a deliberate divergence from the real pool
      // (infra/modules/api.yaml sets MfaConfiguration: "ON") -- cognito-local
      // cannot honor TOTP MFA at all, and exercising MFA enrollment isn't
      // this tooling's goal. See local/cognito/README.md.
      MfaConfiguration: "OFF",
      // No UsernameAttributes override here: the real pool doesn't declare
      // any either, so sign-in is by literal Username, not email alias --
      // matching frontend/src/pages/LoginPage.tsx's plain "Username" field.
      // (cognito-local defaults to email-alias usernames; that default is
      // overridden via .cognito/config.json, written by `make auth-run`
      // before this script runs.)
      Policies: {
        PasswordPolicy: {
          MinimumLength: 12,
          RequireUppercase: true,
          RequireLowercase: true,
          RequireNumbers: true,
          RequireSymbols: true,
        },
      },
      // `role` -> `custom:role`, matching infra/modules/api.yaml's real
      // schema declaration and backend/src/shared/auth.py's Role enum.
      Schema: [
        {
          Name: "role",
          AttributeDataType: "String",
          Mutable: true,
          Required: false,
        },
      ],
    })
  );
  const userPoolId = UserPool.Id;
  console.log(`Created User Pool: ${userPoolId}`);

  const { UserPoolClient } = await client.send(
    new CreateUserPoolClientCommand({
      UserPoolId: userPoolId,
      ClientName: "sls-best-practice-local-client",
      GenerateSecret: false,
      // Deliberately NOT ALLOW_USER_SRP_AUTH-only, unlike the real pool's
      // client (infra/modules/api.yaml) -- cognito-local cannot emulate
      // USER_SRP_AUTH at all. See local/cognito/README.md for why local
      // testing necessarily uses a different auth flow than production.
      ExplicitAuthFlows: ["ALLOW_USER_PASSWORD_AUTH", "ALLOW_REFRESH_TOKEN_AUTH"],
    })
  );
  const clientId = UserPoolClient.ClientId;
  console.log(`Created User Pool Client: ${clientId}`);

  for (const user of [SEED_USERS.admin, SEED_USERS.clinicOps]) {
    await client.send(
      new AdminCreateUserCommand({
        UserPoolId: userPoolId,
        Username: user.username,
        UserAttributes: [
          { Name: "email", Value: user.email },
          { Name: "email_verified", Value: "true" },
          { Name: "custom:role", Value: user.role },
        ],
        MessageAction: "SUPPRESS",
        // Overwritten immediately by AdminSetUserPassword below; irrelevant.
        TemporaryPassword: "Ignored-Temp-1A!",
      })
    );
    await client.send(
      new AdminSetUserPasswordCommand({
        UserPoolId: userPoolId,
        Username: user.username,
        Password: user.password,
        Permanent: true,
      })
    );
    console.log(`Seeded user: ${user.username} (custom:role=${user.role}, permanent password)`);
  }

  {
    const user = SEED_USERS.newHire;
    await client.send(
      new AdminCreateUserCommand({
        UserPoolId: userPoolId,
        Username: user.username,
        UserAttributes: [
          { Name: "email", Value: user.email },
          { Name: "email_verified", Value: "true" },
          { Name: "custom:role", Value: user.role },
        ],
        MessageAction: "SUPPRESS",
        TemporaryPassword: user.temporaryPassword,
        // No AdminSetUserPassword call -- this is what leaves the user in
        // FORCE_CHANGE_PASSWORD, empirically confirmed to produce a real
        // NEW_PASSWORD_REQUIRED challenge from InitiateAuth. See README.
      })
    );
    console.log(`Seeded user: ${user.username} (custom:role=${user.role}, FORCE_CHANGE_PASSWORD)`);
  }

  await writeEnvLocal({
    VITE_COGNITO_USER_POOL_ID: userPoolId,
    VITE_COGNITO_CLIENT_ID: clientId,
    VITE_COGNITO_LOCAL_ENDPOINT: PUBLIC_ENDPOINT,
  });
  console.log(`Wrote ${FRONTEND_ENV_LOCAL}`);
  if (PUBLIC_ENDPOINT !== LOCAL_ENDPOINT) {
    console.log(
      `(VITE_COGNITO_LOCAL_ENDPOINT points at the public tunnel URL ${PUBLIC_ENDPOINT}; this script's own connection above stayed on ${LOCAL_ENDPOINT})`
    );
  }

  console.log("\nDone. Seeded accounts:");
  console.log(`  ${SEED_USERS.admin.username} / ${SEED_USERS.admin.password}  (custom:role=admin)`);
  console.log(
    `  ${SEED_USERS.clinicOps.username} / ${SEED_USERS.clinicOps.password}  (custom:role=clinic_ops)`
  );
  console.log(
    `  ${SEED_USERS.newHire.username}  (FORCE_CHANGE_PASSWORD -- app's new-password screen picks a password on first sign-in)`
  );
}

// Updates just the three VITE_COGNITO_* keys in frontend/.env.local,
// creating the file if it doesn't exist and leaving any other lines
// (including unrelated overrides a developer already added) untouched.
async function writeEnvLocal(updates) {
  let existingLines = [];
  try {
    const existing = await readFile(FRONTEND_ENV_LOCAL, "utf8");
    existingLines = existing.split("\n");
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }

  const keys = Object.keys(updates);
  const seen = new Set();
  const updatedLines = existingLines.map((line) => {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=/);
    if (match && keys.includes(match[1])) {
      seen.add(match[1]);
      return `${match[1]}=${updates[match[1]]}`;
    }
    return line;
  });

  // Drop a single trailing blank line so appended keys don't accumulate
  // extra blank lines across repeated seed runs.
  if (updatedLines.length > 0 && updatedLines[updatedLines.length - 1] === "") {
    updatedLines.pop();
  }

  const missing = keys.filter((k) => !seen.has(k));
  if (missing.length > 0) {
    if (updatedLines.length > 0) updatedLines.push("");
    updatedLines.push("# Written by `local/cognito/seed.mjs` (make auth-run)");
    for (const key of missing) {
      updatedLines.push(`${key}=${updates[key]}`);
    }
  }

  await writeFile(FRONTEND_ENV_LOCAL, updatedLines.join("\n") + "\n", "utf8");
}

main().catch((err) => {
  console.error("Seeding failed:", err);
  process.exit(1);
});
