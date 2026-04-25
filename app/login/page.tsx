"use client";

import { useMutation } from "@tanstack/react-query";
import { GitBranch, Zap } from "lucide-react";
import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/utils/supabase/client";

export default function LoginPage() {
  const supabase = useMemo(() => createClient(), []);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const loginMutation = useMutation({
    mutationFn: async ({ email, password }: { email: string; password: string }) => {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        throw error;
      }
    },
    onSuccess: () => {
      toast.success("Logare reusita. Te redirectionez...");
      window.location.href = "/";
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const githubMutation = useMutation({
    mutationFn: async () => {
      const origin = window.location.origin;
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "github",
        options: {
          redirectTo: `${origin}/auth/callback`,
        },
      });

      if (error) {
        throw error;
      }

      if (data.url) {
        window.location.href = data.url;
      }
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    loginMutation.mutate({ email, password });
  };

  const isPending = loginMutation.isPending || githubMutation.isPending;

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10 text-foreground">
      <section className="w-full max-w-4xl bg-card p-6 md:p-10">
        <header className="mb-6 pb-2">
          <h1 className="font-mono text-2xl font-semibold tracking-widest">LOGIN</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Alege metoda de autentificare: GitHub OAuth sau email + parola.
          </p>
        </header>

        <div className="grid gap-5 md:grid-cols-[1fr_auto_1fr] md:items-stretch">
          <div className="space-y-4 bg-card/60 p-5">
            <p className="text-xs font-semibold tracking-widest text-muted-foreground">
              OAUTH
            </p>
            <h2 className="font-mono text-xl font-semibold">GitHub Access</h2>
            <p className="text-sm text-muted-foreground">
              Logare rapida cu contul tau GitHub.
            </p>

            <button
              type="button"
              disabled={isPending}
              onClick={() => {
                githubMutation.mutate();
              }}
              className="inline-flex w-full items-center justify-center gap-2 bg-foreground px-4 py-2 text-sm font-semibold uppercase tracking-wide text-background transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <GitBranch className="h-4 w-4" />
              {githubMutation.isPending ? "Redirectionare..." : "Intra cu GitHub"}
            </button>
          </div>

          <div className="z-10 flex h-10 w-10 items-center justify-center self-center">
              <Zap className="h-5 w-5 text-primary" />
          </div>

          <div className="space-y-4 bg-card/60 p-5">
            <p className="text-xs font-semibold tracking-widest text-muted-foreground">
              CLASSIC
            </p>
            <h2 className="font-mono text-xl font-semibold">Email + Password</h2>

            <form className="space-y-4" onSubmit={onSubmit}>
              <label className="block text-sm">
                <span className="mb-1 block text-muted-foreground">Email</span>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  className="w-full border border-input/60 bg-card px-3 py-2 text-sm outline-none transition focus:border-ring"
                  placeholder="you@example.com"
                />
              </label>

              <label className="block text-sm">
                <span className="mb-1 block text-muted-foreground">Parola</span>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  minLength={6}
                  className="w-full border border-input/60 bg-card px-3 py-2 text-sm outline-none transition focus:border-ring"
                  placeholder="••••••••"
                />
              </label>

              <button
                type="submit"
                disabled={isPending}
                className="w-full bg-primary px-3 py-2 text-sm font-semibold uppercase tracking-wide text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loginMutation.isPending ? "Se autentifica..." : "Intra cu email"}
              </button>

              <Link
                href="/forgot-password"
                className="inline-block text-xs text-muted-foreground underline underline-offset-4 transition hover:text-foreground"
              >
                Ai uitat parola?
              </Link>
            </form>
          </div>
        </div>

        <p className="mt-6 text-sm text-muted-foreground">
          Nu ai cont?{" "}
          <Link href="/register" className="font-semibold text-foreground underline underline-offset-4">
            Inregistreaza-te
          </Link>
        </p>
      </section>
    </main>
  );
}
