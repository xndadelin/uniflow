"use client";

import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/utils/supabase/client";

export default function ResetPasswordPage() {
  const supabase = useMemo(() => createClient(), []);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [hasRecoverySession, setHasRecoverySession] = useState(false);

  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.auth.getSession();

      if (data.session) {
        setHasRecoverySession(true);
      }
    };

    void init();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
        setHasRecoverySession(true);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [supabase]);

  const updatePasswordMutation = useMutation({
    mutationFn: async ({ password }: { password: string }) => {
      const { error } = await supabase.auth.updateUser({
        password,
      });

      if (error) {
        throw error;
      }
    },
    onSuccess: () => {
      toast.success("Parola a fost actualizata. Te redirectionez spre logare...");
      setTimeout(() => {
        window.location.href = "/login";
      }, 1200);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!hasRecoverySession) {
      toast.error("Linkul de resetare nu este valid sau a expirat. Cere unul nou.");
      return;
    }

    if (password.length < 6) {
      toast.error("Parola trebuie sa aiba minim 6 caractere.");
      return;
    }

    if (password !== confirmPassword) {
      toast.error("Parolele nu coincid.");
      return;
    }

    updatePasswordMutation.mutate({ password });
  };

  return (
    <main className="flex min-h-[70vh] items-center justify-center px-4 py-6 text-foreground">
      <section className="w-full max-w-sm bg-card p-5 md:p-6">
        <header className="mb-4">
          <h1 className="font-mono text-xl font-semibold tracking-widest">NEW PASSWORD</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Seteaza o parola noua pentru contul tau.
          </p>
        </header>

        <form className="space-y-3" onSubmit={onSubmit}>
          <label className="block text-sm">
            <span className="mb-1 block text-muted-foreground">Parola noua</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={6}
              className="w-full border border-input/60 bg-card px-3 py-2 text-sm outline-none transition focus:border-ring"
              placeholder="Minim 6 caractere"
            />
          </label>

          <label className="block text-sm">
            <span className="mb-1 block text-muted-foreground">Confirma parola</span>
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              required
              minLength={6}
              className="w-full border border-input/60 bg-card px-3 py-2 text-sm outline-none transition focus:border-ring"
              placeholder="Repeta parola"
            />
          </label>

          <button
            type="submit"
            disabled={updatePasswordMutation.isPending}
            className="w-full bg-primary px-3 py-2 text-sm font-semibold uppercase tracking-wide text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {updatePasswordMutation.isPending ? "Se salveaza..." : "Actualizeaza parola"}
          </button>
        </form>

        {!hasRecoverySession ? (
          <p className="mt-4 text-xs text-muted-foreground">
            Deschide aceasta pagina din emailul de resetare. Daca linkul a expirat, cere unul nou.
          </p>
        ) : null}

        <p className="mt-4 text-sm text-muted-foreground">
          Inapoi la{" "}
          <Link href="/login" className="font-semibold text-foreground underline underline-offset-4">
            Logare
          </Link>
        </p>
      </section>
    </main>
  );
}
