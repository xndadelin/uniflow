"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/utils/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pagination } from "@/components/Pagination";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type AuditLogRow = {
  id: number;
  created_at: string;
  actor_id: string | null;
  action: string;
  entity_table: string | null;
  entity_id: string | null;
  course_id: number | null;
  message: string | null;
  metadata: unknown;
};

function getErrorMessage(err: unknown) {
  if (!err) return "Eroare necunoscuta.";
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && "message" in err && typeof (err as { message?: unknown }).message === "string") {
    return (err as { message: string }).message;
  }
  return "Eroare la request.";
}

function prettyJson(x: unknown) {
  try {
    return JSON.stringify(x, null, 2);
  } catch {
    return String(x);
  }
}

function getChangedKeys(metadata: unknown): string[] {
  if (!metadata || typeof metadata !== "object") return [];
  if (!("changed_keys" in metadata)) return [];
  const v = (metadata as { changed_keys?: unknown }).changed_keys;
  return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
}

function getChanges(metadata: unknown): unknown {
  if (!metadata || typeof metadata !== "object") return null;
  if (!("changes" in metadata)) return null;
  return (metadata as { changes?: unknown }).changes ?? null;
}

export default function AuditPage() {
  const supabase = useMemo(() => createClient(), []);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<AuditLogRow | null>(null);
  const pageSize = 25;

  const auditCheckQuery = useQuery({
    queryKey: ["audit-check"],
    queryFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return { isAudit: false, isAuthenticated: false };
      const { data, error } = await supabase.rpc("is_audit", { _user_id: user.id });
      if (error) throw error;
      return { isAudit: Boolean(data), isAuthenticated: true };
    },
  });

  const logsQuery = useQuery({
    queryKey: ["audit-logs", { page, search }],
    enabled: auditCheckQuery.data?.isAudit === true,
    queryFn: async () => {
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      const q = search.trim().toLowerCase();

      // We keep filtering client-side to avoid "or" full-text complexity for now.
      const res = await supabase
        .from("audit_logs")
        .select("id,created_at,actor_id,action,entity_table,entity_id,course_id,message,metadata", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(from, to);

      if (res.error) throw res.error;
      let rows = (res.data ?? []) as AuditLogRow[];

      if (q) {
        rows = rows.filter((r) => {
          const hay = `${r.action ?? ""} ${r.entity_table ?? ""} ${r.entity_id ?? ""} ${r.course_id ?? ""} ${r.message ?? ""} ${
            typeof r.metadata === "string" ? r.metadata : ""
          }`.toLowerCase();
          return hay.includes(q);
        });
      }

      return { rows, count: res.count ?? 0 };
    },
  });

  if (auditCheckQuery.isLoading) {
    return (
      <main className="flex min-h-[70vh] items-center justify-center px-4 py-8">
        <section className="w-full max-w-md bg-card p-6 text-sm text-muted-foreground">Se verifica accesul...</section>
      </main>
    );
  }

  if (!auditCheckQuery.data?.isAuthenticated) {
    return (
      <main className="flex min-h-[70vh] items-center justify-center px-4 py-8">
        <section className="w-full max-w-md bg-card p-6">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Acces restrictionat</h1>
          <p className="mt-2 text-sm text-muted-foreground">Trebuie sa fii autentificat pentru aceasta pagina.</p>
          <Link href="/login" className="mt-5 inline-flex rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
            Mergi la logare
          </Link>
        </section>
      </main>
    );
  }

  if (!auditCheckQuery.data?.isAudit) {
    return (
      <main className="flex min-h-[70vh] items-center justify-center px-4 py-8">
        <section className="w-full max-w-md bg-card p-6">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Acces interzis</h1>
          <p className="mt-2 text-sm text-muted-foreground">Doar utilizatorii cu rol audit pot accesa jurnalizarea.</p>
          <Link href="/" className="mt-5 inline-flex rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
            Inapoi acasa
          </Link>
        </section>
      </main>
    );
  }

  const rows = logsQuery.data?.rows ?? [];
  const count = logsQuery.data?.count ?? 0;

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-4 py-8 md:px-6">
      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">Audit</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">Jurnalizare</h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Evenimente generate automat (roluri, cereri resurse, materiale, teme, submisii).
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/">Inapoi</Link>
        </Button>
      </header>

      <Card>
        <CardHeader className="space-y-1">
          <CardTitle className="text-base font-semibold tracking-tight">Audit logs</CardTitle>
          <p className="text-xs text-muted-foreground">
            Total: <span className="font-mono text-foreground">{count}</span>
          </p>
        </CardHeader>
        <CardContent className="p-0">
          <div className="sticky top-[60px] z-10 border-b border-border/60 bg-card/90 backdrop-blur supports-[backdrop-filter]:bg-card/70">
            <div className="grid gap-3 p-4 sm:grid-cols-[1fr_auto] sm:items-end">
              <div className="space-y-1">
                <Label htmlFor="audit-search" className="text-xs">
                  Cauta (local in pagina curenta)
                </Label>
                <Input
                  id="audit-search"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  placeholder="action / entity / course / message..."
                />
              </div>
              <div className="sm:pb-[2px]">
                <Pagination variant="compact" page={page} pageSize={pageSize} totalItems={count} onPageChange={setPage} />
              </div>
            </div>
          </div>

          {logsQuery.isLoading ? (
            <div className="p-4 text-sm text-muted-foreground">Se incarca...</div>
          ) : logsQuery.isError ? (
            <div className="p-4">
              <div className="rounded-md bg-destructive/5 p-4 text-sm text-destructive">
                Eroare: <span className="font-mono text-xs">{getErrorMessage(logsQuery.error)}</span>
              </div>
            </div>
          ) : rows.length === 0 ? (
            <div className="p-4">
              <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">Nu exista log-uri.</div>
            </div>
          ) : (
            <div className="max-h-[70vh] overflow-auto">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/70">
                  <TableRow>
                    <TableHead className="px-4 py-3">Timp</TableHead>
                    <TableHead className="px-4 py-3">Actiune</TableHead>
                    <TableHead className="px-4 py-3">Entity</TableHead>
                    <TableHead className="px-4 py-3 text-right">Curs</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => {
                    const changed = getChangedKeys(r.metadata);
                    const changedCount = changed.length;
                    const showChanged = r.action.endsWith("_update") && changedCount > 0;
                    return (
                      <TableRow
                        key={r.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelected(r)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setSelected(r);
                          }
                        }}
                        className="cursor-pointer hover:bg-muted/20"
                      >
                        <TableCell className="px-4 py-3 text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                          {new Date(r.created_at).toLocaleString()}
                        </TableCell>
                        <TableCell className="px-4 py-3">
                          <div className="flex flex-col gap-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <div className="text-sm font-medium text-foreground">{r.action}</div>
                              {showChanged ? (
                                <Badge variant="outline" className="text-[10px]">
                                  changed: {changedCount}
                                </Badge>
                              ) : null}
                            </div>
                            {r.message ? <div className="text-[11px] text-muted-foreground">{r.message}</div> : null}
                          </div>
                        </TableCell>
                        <TableCell className="px-4 py-3 text-xs text-muted-foreground">
                          <div className="flex flex-wrap items-center gap-2">
                            {r.entity_table ? <Badge variant="secondary">{r.entity_table}</Badge> : <Badge variant="outline">n/a</Badge>}
                            {r.entity_id ? <span className="font-mono">{r.entity_id}</span> : null}
                          </div>
                        </TableCell>
                        <TableCell className="px-4 py-3 text-right text-xs text-muted-foreground whitespace-nowrap">{r.course_id ?? "-"}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
      <Dialog open={Boolean(selected)} onOpenChange={(open) => (!open ? setSelected(null) : null)}>
        <DialogContent className="max-w-3xl p-0">
          {selected ? (
            <div className="overflow-hidden rounded-lg">
              <DialogHeader className="space-y-1 border-b border-border/60 px-5 py-4">
                <DialogTitle className="text-base font-semibold tracking-tight">
                  #{selected.id} · <span className="font-mono">{selected.action}</span>
                </DialogTitle>
                <DialogDescription className="text-xs">
                  {new Date(selected.created_at).toLocaleString()} ·{" "}
                  <span className="font-mono">
                    {selected.entity_table ?? "n/a"}
                    {selected.entity_id ? ` · ${selected.entity_id}` : ""}
                    {selected.course_id ? ` · course#${selected.course_id}` : ""}
                  </span>
                </DialogDescription>
              </DialogHeader>

              <div className="px-5 py-4">
                {selected.message ? <div className="mb-3 text-sm text-foreground">{selected.message}</div> : null}

                {(() => {
                  const changed = getChangedKeys(selected.metadata);
                  const changes = getChanges(selected.metadata);
                  return changed.length ? (
                    <div className="mb-3 rounded-md border border-border/60 bg-muted/10 p-3">
                      <div className="text-xs text-muted-foreground">Changed keys</div>
                      <div className="mt-1 text-xs font-mono text-foreground">{changed.join(", ")}</div>
                      {changes ? (
                        <pre className="mt-3 max-h-[220px] overflow-auto rounded-md border border-border/60 bg-background/40 p-3 text-xs text-muted-foreground">
                          {prettyJson(changes)}
                        </pre>
                      ) : null}
                    </div>
                  ) : null;
                })()}

                <div className="text-xs text-muted-foreground">Metadata (full)</div>
                <pre className="mt-2 max-h-[50vh] overflow-auto rounded-md border border-border/60 bg-muted/10 p-3 text-xs text-muted-foreground">
                  {prettyJson(selected.metadata)}
                </pre>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

    </main>
  );
}

