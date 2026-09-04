import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Navigate } from "react-router-dom";
import { z } from "zod";

import { useAuth } from "@/auth/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

const signInSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});
type SignInValues = z.infer<typeof signInSchema>;

// Mirrors the Cognito UserPool password policy in infra/modules/api.yaml —
// gives feedback before the request round-trip instead of after.
const newPasswordSchema = z.object({
  newPassword: z
    .string()
    .min(12, "At least 12 characters")
    .regex(/[A-Z]/, "At least one uppercase letter")
    .regex(/[a-z]/, "At least one lowercase letter")
    .regex(/[0-9]/, "At least one number")
    .regex(/[^A-Za-z0-9]/, "At least one symbol"),
});
type NewPasswordValues = z.infer<typeof newPasswordSchema>;

export function LoginPage() {
  const { state, signIn, completeNewPassword } = useAuth();
  const [formError, setFormError] = useState<string | null>(null);

  const signInForm = useForm<SignInValues>({ resolver: zodResolver(signInSchema) });
  const newPasswordForm = useForm<NewPasswordValues>({ resolver: zodResolver(newPasswordSchema) });

  if (state.status === "signedIn") {
    return <Navigate to="/" replace />;
  }

  async function onSignIn(values: SignInValues) {
    setFormError(null);
    try {
      await signIn(values.username, values.password);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Sign in failed");
    }
  }

  async function onCompleteNewPassword(values: NewPasswordValues) {
    setFormError(null);
    try {
      await completeNewPassword(values.newPassword);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not set new password");
    }
  }

  const isNewPasswordStep = state.status === "newPasswordRequired";

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{isNewPasswordStep ? "Set a new password" : "Sign in"}</CardTitle>
          <CardDescription>
            {isNewPasswordStep
              ? "Your account was just provisioned — choose a password to finish setting it up."
              : "sls-best-practice staff sign-in. Accounts are provisioned by an admin, not self-service."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isNewPasswordStep ? (
            <form
              className="flex flex-col gap-4"
              onSubmit={newPasswordForm.handleSubmit(onCompleteNewPassword)}
            >
              <Field>
                <FieldLabel htmlFor="newPassword">New password</FieldLabel>
                <Input
                  id="newPassword"
                  type="password"
                  autoComplete="new-password"
                  aria-invalid={!!newPasswordForm.formState.errors.newPassword}
                  {...newPasswordForm.register("newPassword")}
                />
                <FieldError
                  errors={
                    newPasswordForm.formState.errors.newPassword
                      ? [newPasswordForm.formState.errors.newPassword]
                      : []
                  }
                />
              </Field>
              {formError && <p className="text-sm text-destructive">{formError}</p>}
              <Button type="submit" disabled={newPasswordForm.formState.isSubmitting}>
                Set password and sign in
              </Button>
            </form>
          ) : (
            <form className="flex flex-col gap-4" onSubmit={signInForm.handleSubmit(onSignIn)}>
              <Field>
                <FieldLabel htmlFor="username">Username</FieldLabel>
                <Input
                  id="username"
                  autoComplete="username"
                  aria-invalid={!!signInForm.formState.errors.username}
                  {...signInForm.register("username")}
                />
                <FieldError
                  errors={
                    signInForm.formState.errors.username
                      ? [signInForm.formState.errors.username]
                      : []
                  }
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="password">Password</FieldLabel>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  aria-invalid={!!signInForm.formState.errors.password}
                  {...signInForm.register("password")}
                />
                <FieldError
                  errors={
                    signInForm.formState.errors.password
                      ? [signInForm.formState.errors.password]
                      : []
                  }
                />
              </Field>
              {formError && <p className="text-sm text-destructive">{formError}</p>}
              <Button type="submit" disabled={signInForm.formState.isSubmitting}>
                Sign in
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
