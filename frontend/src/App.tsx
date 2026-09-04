import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { AuthProvider } from "@/auth/AuthContext";
import { AppShell } from "@/components/layout/AppShell";
import { PageLoader } from "@/components/page-loader";
import { AdminRoute, ProtectedRoute } from "@/components/routing/ProtectedRoute";
import { Toaster } from "@/components/ui/sonner";

// Route-level code splitting: each page (and whatever it alone depends on,
// e.g. TanStack Table only for the pages with a DataTable) loads on
// navigation rather than in the initial bundle.
const LoginPage = lazy(() => import("@/pages/LoginPage").then((m) => ({ default: m.LoginPage })));
const PatientsPage = lazy(() =>
  import("@/pages/PatientsPage").then((m) => ({ default: m.PatientsPage })),
);
const PatientDetailPage = lazy(() =>
  import("@/pages/PatientDetailPage").then((m) => ({ default: m.PatientDetailPage })),
);
const AuditLogPage = lazy(() =>
  import("@/pages/AuditLogPage").then((m) => ({ default: m.AuditLogPage })),
);
const ReactQueryDevtools = lazy(() =>
  import("@tanstack/react-query-devtools").then((m) => ({ default: m.ReactQueryDevtools })),
);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});

export function App() {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <BrowserRouter>
            <Suspense fallback={<PageLoader />}>
              <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route element={<ProtectedRoute />}>
                  <Route element={<AppShell />}>
                    <Route path="/" element={<PatientsPage />} />
                    <Route path="/patients/:patientId" element={<PatientDetailPage />} />
                    <Route element={<AdminRoute />}>
                      <Route path="/audit-log" element={<AuditLogPage />} />
                    </Route>
                  </Route>
                </Route>
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
          <Toaster />
        </AuthProvider>
        {import.meta.env.DEV && (
          <Suspense fallback={null}>
            <ReactQueryDevtools initialIsOpen={false} />
          </Suspense>
        )}
      </QueryClientProvider>
    </ThemeProvider>
  );
}
