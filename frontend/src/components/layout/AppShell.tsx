import { LogOut, ShieldCheck, UserRound } from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";

import { useAuth } from "@/auth/AuthContext";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
    isActive ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:text-foreground",
  );

export function AppShell() {
  const { state, signOut } = useAuth();
  const user = state.status === "signedIn" ? state.user : null;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-6">
            <span className="text-sm font-semibold">sls-best-practice</span>
            <nav className="flex items-center gap-1">
              <NavLink to="/" end className={navLinkClass}>
                Patients
              </NavLink>
              {user?.role === "admin" && (
                <NavLink to="/audit-log" className={navLinkClass}>
                  Audit Log
                </NavLink>
              )}
            </nav>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            {user && (
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={<button type="button" className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted" />}
                >
                  <UserRound className="size-4" />
                  <span>{user.subject}</span>
                  <Badge variant={user.role === "admin" ? "default" : "secondary"}>
                    {user.role ?? "no role"}
                  </Badge>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="size-4" />
                      Signed in as {user.role ?? "no role"}
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={signOut} variant="destructive">
                    <LogOut className="size-4" />
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}
