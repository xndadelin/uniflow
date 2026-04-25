"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { createClient } from "@/utils/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type InventoryRow = {
  resource_type: "tokens" | "vps_subscription";
  total_amount: number;
  remaining_amount: number;
};

type SuggestedInventoryRow = {
  resource_type: "tokens" | "vps_subscription";
  required_total: number;
  suggested_total: number;
};

export default function AdminInventarPage() {
  const supabase = useMemo(() => createClient(), []);
  const [tokensTotal, setTokensTotal] = useState<string>("0");
  const [vpsTotal, setVpsTotal] = useState<string>("0");

  const adminCheckQuery = useQuery({
    queryKey: ["admin-check"],
    queryFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return { isAdmin: false, isAuthenticated: false };

      const { data, error } = await supabase.rpc("is_admin", { _user_id: user.id });
      if (error) throw error;
      return { isAdmin: Boolean(data), isAuthenticated: true };
    },
  });

  const dataQuery = useQuery({
    queryKey: ["admin-inventar-data"],
    enabled: adminCheckQuery.data?.isAdmin === true,
    queryFn: async () => {
      const [invRes, suggestedRes] = await Promise.all([
        supabase.from("resource_inventory").select("resource_type,total_amount,remaining_amount").order("resource_type", { ascending: true }),
        supabase.rpc("get_suggested_inventory"),
      ]);

      if (invRes.error) throw invRes.error;
      if (suggestedRes.error) throw suggestedRes.error;

      return {
        inventory: (invRes.data ?? []) as InventoryRow[],
        suggested: (suggestedRes.data ?? []) as SuggestedInventoryRow[],
      };
    },
  });

  const setInventoryMutation = useMutation({
    mutationFn: async () => {
      const t = Number(tokensTotal);
      const v = Number(vpsTotal);
      if (!Number.isFinite(t) || t < 0) throw new Error("Total tokens invalid.");
      if (!Number.isFinite(v) || v < 0) throw new Error("Total VPS invalid.");

      const [a, b] = await Promise.all([
        supabase.rpc("set_resource_inventory", { _resource_type: "tokens", _total: t }),
        supabase.rpc("set_resource_inventory", { _resource_type: "vps_subscription", _total: v }),
      ]);
      if (a.error) throw a.error;
      if (b.error) throw b.error;
    },
    onSuccess: async () => {
      toast.success("Inventar actualizat.");
      await dataQuery.refetch();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Eroare."),
  });

  const applySuggestedInventoryMutation = useMutation({
    mutationFn: async () => {
      const suggested = dataQuery.data?.suggested ?? [];
      const tokens = suggested.find((s) => s.resource_type === "tokens")?.suggested_total ?? 0;
      const vps = suggested.find((s) => s.resource_type === "vps_subscription")?.suggested_total ?? 0;

      const [a, b] = await Promise.all([
        supabase.rpc("set_resource_inventory", { _resource_type: "tokens", _total: tokens }),
        supabase.rpc("set_resource_inventory", { _resource_type: "vps_subscription", _total: vps }),
      ]);
      if (a.error) throw a.error;
      if (b.error) throw b.error;
    },
    onSuccess: async () => {
      toast.success("Inventar setat la recomandat (>=10% extra).");
      await dataQuery.refetch();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Eroare."),
  });

  if (adminCheckQuery.isLoading) {
    return (
      <main className="flex min-h-[70vh] items-center justify-center px-4 py-8">
        <section className="w-full max-w-md bg-card p-6 text-sm text-muted-foreground">Se verifica accesul...</section>
      </main>
    );
  }

  if (!adminCheckQuery.data?.isAuthenticated) {
    return (
      <main className="flex min-h-[70vh] items-center justify-center px-4 py-8">
        <section className="w-full max-w-md bg-card p-6">
          <h1 className="font-mono text-xl font-semibold text-foreground">Acces restrictionat</h1>
          <p className="mt-2 text-sm text-muted-foreground">Trebuie sa fii autentificat pentru aceasta pagina.</p>
          <Link href="/login" className="mt-4 inline-flex bg-primary px-4 py-2 text-xs font-semibold uppercase tracking-wide text-primary-foreground">
            Mergi la logare
          </Link>
        </section>
      </main>
    );
  }

  if (!adminCheckQuery.data?.isAdmin) {
    return (
      <main className="flex min-h-[70vh] items-center justify-center px-4 py-8">
        <section className="w-full max-w-md bg-card p-6">
          <h1 className="font-mono text-xl font-semibold text-foreground">Acces interzis</h1>
          <p className="mt-2 text-sm text-muted-foreground">Doar utilizatorii cu rol admin pot gestiona inventar.</p>
          <Link href="/" className="mt-4 inline-flex bg-primary px-4 py-2 text-xs font-semibold uppercase tracking-wide text-primary-foreground">
            Inapoi acasa
          </Link>
        </section>
      </main>
    );
  }

  const inventory = dataQuery.data?.inventory ?? [];
  const suggested = dataQuery.data?.suggested ?? [];

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-8">
      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.24em] text-primary">Admin</p>
          <h1 className="mt-2 font-mono text-2xl font-semibold tracking-wider text-foreground">Inventar global</h1>
          <p className="mt-1 text-sm text-muted-foreground">Setezi totalul de resurse disponibile (include minim 10% extra recomandat).</p>
        </div>
        <Link href="/admin" className="inline-flex bg-muted/30 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-foreground transition hover:bg-muted/50">
          Inapoi la dashboard
        </Link>
      </header>

      <section className="rounded-lg border border-border bg-card p-4 md:p-6">
        <div className="rounded-md border border-border/70 bg-muted/10 p-4">
          <div className="text-xs font-medium text-foreground">Recomandare inventar (necesar + minim 10% extra)</div>
          {suggested.length === 0 ? (
            <div className="mt-2 text-xs text-muted-foreground">Nu exista inca cerinte de la profesori.</div>
          ) : (
            <div className="mt-2 space-y-1 text-xs text-muted-foreground">
              {suggested.map((s) => (
                <div key={s.resource_type}>
                  <span className="font-mono text-foreground">{s.resource_type}</span>: necesar {s.required_total} → recomandat {s.suggested_total}
                </div>
              ))}
            </div>
          )}
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              disabled={applySuggestedInventoryMutation.isPending || suggested.length === 0}
              onClick={() => applySuggestedInventoryMutation.mutate()}
              className="inline-flex items-center justify-center bg-muted/30 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-foreground transition hover:bg-muted/50 disabled:opacity-50"
            >
              Seteaza inventar recomandat
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Total tokens</label>
            <input
              value={tokensTotal}
              onChange={(e) => setTokensTotal(e.target.value)}
              type="number"
              min={0}
              className="mt-1 w-full border border-input/60 bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-ring"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Total abonamente VPS</label>
            <input
              value={vpsTotal}
              onChange={(e) => setVpsTotal(e.target.value)}
              type="number"
              min={0}
              className="mt-1 w-full border border-input/60 bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-ring"
            />
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between gap-3">
          <div className="text-xs text-muted-foreground">Setarea reseteaza remaining = total.</div>
          <button
            type="button"
            disabled={setInventoryMutation.isPending}
            onClick={() => setInventoryMutation.mutate()}
            className="inline-flex items-center justify-center bg-primary px-3 py-2 text-xs font-semibold uppercase tracking-wide text-primary-foreground disabled:opacity-50"
          >
            Salveaza inventar
          </button>
        </div>

        <div className="mt-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tip</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Ramas</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {inventory.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="py-8 text-center text-sm text-muted-foreground">
                    Inventar indisponibil (ruleaza schema SQL).
                  </TableCell>
                </TableRow>
              ) : (
                inventory.map((r) => (
                  <TableRow key={r.resource_type}>
                    <TableCell className="font-mono text-xs text-muted-foreground">{r.resource_type}</TableCell>
                    <TableCell className="text-right font-mono text-xs text-muted-foreground">{r.total_amount}</TableCell>
                    <TableCell className="text-right font-mono text-xs text-muted-foreground">{r.remaining_amount}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </section>
    </main>
  );
}

