"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ThemeToggle } from "@/components/ThemeToggle";
import { CommandPalette } from "@/components/CommandPalette";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type AppTopNavProps = {
  displayName: string | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isProfesor: boolean;
  isAudit: boolean;
  onSignOut?: () => void;
};

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const i = (parts[0]?.[0] ?? "U") + (parts[1]?.[0] ?? "");
  return i.toUpperCase().slice(0, 2);
}

export function AppTopNav({ displayName, isAuthenticated, isAdmin, isProfesor, isAudit, onSignOut }: AppTopNavProps) {
  async function signOut() {
    await fetch("/api/auth/signout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3 px-4 py-3 md:px-6">
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-baseline gap-2 text-foreground">
            <span className="text-sm font-semibold tracking-tight">UniFlow</span>
          </Link>
        </div>

        <div className="flex items-center gap-2">
          <CommandPalette isAuthenticated={isAuthenticated} isAdmin={isAdmin} isProfesor={isProfesor} isAudit={isAudit} />
          <Button
            variant="outline"
            size="sm"
            className="hidden gap-2 sm:inline-flex"
            onClick={() => window.dispatchEvent(new Event("uniflow:open-command-palette"))}
          >
            Cauta
            <span className="rounded border border-border/60 bg-muted/20 px-1.5 py-0.5 text-[10px] text-muted-foreground">⌘K</span>
          </Button>
          <ThemeToggle />
          {isAuthenticated ? (
            <>
              {isAdmin ? (
                <Button asChild variant="outline" size="sm">
                  <Link href="/admin">Admin</Link>
                </Button>
              ) : null}
              {isProfesor ? (
                <Button asChild variant="outline" size="sm">
                  <Link href="/profesor/cursuri">Profesor</Link>
                </Button>
              ) : null}
              {isAudit ? (
                <Button asChild variant="outline" size="sm">
                  <Link href="/audit">Audit</Link>
                </Button>
              ) : null}

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant={"ghost"} size="sm" className="gap-2">
                    <Avatar className="h-7 w-7">
                      <AvatarFallback className="text-[10px]">{initials(displayName ?? "User")}</AvatarFallback>
                    </Avatar>
                    <span className="max-w-[140px] truncate">{displayName ?? "Utilizator"}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>Cont</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href="/">Acasa</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/login">Schimba cont</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/forgot-password">Resetare parola</Link>
                  </DropdownMenuItem>
                  {(onSignOut ?? signOut) ? (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={onSignOut ?? signOut}>Delogare</DropdownMenuItem>
                    </>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
            <>
              <Button asChild size="sm">
                <Link href="/login">Logare</Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link href="/register">Inregistrare</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

