"use client";

import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/utils/supabase/client";

export default function ForgotPasswordPage() {
  const supabase = useMemo(() => createClient(), []);
  const [email, setEmail] = useState("");

  const resetRequestMutation = useMutation({
    mutationFn: async ({ email }: { email: string }) => {
      const origin = window.location.origin;

      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${origin}/reset-password`,
      });

      if (error) {
        throw error;
      }
    },
    onSuccess: () => {
      toast.success(
        "Daca exista cont pentru acest email, am trimis linkul de resetare.",
      );
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    resetRequestMutation.mutate({ email });
  };

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10 text-foreground">
      <section className="w-full max-w-md bg-card p-6 md:p-8">
        <header className="mb-6">
          <h1 className="font-mono text-2xl font-semibold tracking-widest">RESET PASSWORD</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Introdu emailul si primesti un link pentru resetarea parolei.
          </p>
        </header>

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

          <button
            type="submit"
            disabled={resetRequestMutation.isPending}
            className="w-full bg-primary px-3 py-2 text-sm font-semibold uppercase tracking-wide text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {resetRequestMutation.isPending ? "Se trimite..." : "Trimite link resetare"}
          </button>
        </form>

        <p className="mt-6 text-sm text-muted-foreground">
          Ti-ai amintit parola?{" "}
          <Link href="/login" className="font-semibold text-foreground underline underline-offset-4">
            Logare
          </Link>
        </p>
      </section>
    </main>
  );
}
