"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-10">
      <section className="rounded-lg border border-destructive/40 bg-destructive/5 p-6">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">A apărut o problemă</h1>
        <p className="mt-2 text-sm text-muted-foreground">Nu am putut încărca materialul. Poți încerca din nou.</p>
        <div className="mt-4 rounded-md bg-muted/20 p-3 font-mono text-xs text-muted-foreground">
          {error?.message || "Eroare necunoscuta."}
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button onClick={reset} size="sm">
            Reîncearcă
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/">Acasă</Link>
          </Button>
        </div>
      </section>
    </main>
  );
}

