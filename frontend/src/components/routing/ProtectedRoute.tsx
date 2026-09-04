import { Loader2 } from "lucide-react";
import { Navigate, Outlet } from "react-router-dom";

import { useAuth } from "@/auth/AuthContext";

export function ProtectedRoute() {
  const { state } = useAuth();

  if (state.status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (state.status !== "signedIn") {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}

export function AdminRoute() {
  const { state } = useAuth();

  if (state.status !== "signedIn") {
    return <Navigate to="/login" replace />;
  }

  if (state.user.role !== "admin") {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        You need the admin role to view this page.
      </div>
    );
  }

  return <Outlet />;
}
