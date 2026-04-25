"use client";

import Link from "next/link";
import { Fragment, useMemo, useState } from "react";
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

type ActorRow = { id: string; full_name: string | null; email: string };
type AuditLogRowWithActor = AuditLogRow & { actor: ActorRow | null };

function getActor(a: ActorRow | null | undefined) {
  return a ?? null;
}

function extractActivityIdsFromText(s: string): number[] {
  const out: number[] = [];
  const re = /activity_id=(\d+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    const id = Number(m[1]);
    if (Number.isFinite(id) && id > 0) out.push(id);
  }
  return out;
}

function decorateNote(value: unknown, activityTitlesById: Record<string, string>): unknown {
  if (typeof value !== "string") return value;
  const ids = extractActivityIdsFromText(value);
  if (!ids.length) return value;
  const id = ids[0];
  const title = activityTitlesById[String(id)];
  if (!title) return value;
  return `${value} (${title})`;
}

function decorateChanges(changes: unknown, activityTitlesById: Record<string, string>): unknown {
  if (!changes || typeof changes !== "object") return changes;
  const obj = changes as Record<string, unknown>;
  if (!("note" in obj)) return changes;
  const note = obj.note;
  if (!note || typeof note !== "object") return changes;
  const noteObj = note as Record<string, unknown>;
  return {
    ...obj,
    note: {
      ...noteObj,
      old: decorateNote(noteObj.old, activityTitlesById),
      new: decorateNote(noteObj.new, activityTitlesById),
    },
  };
}

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

function normalizeMetadata(meta: unknown): unknown {
  if (typeof meta !== "string") return meta;
  try {
    return JSON.parse(meta) as unknown;
  } catch {
    return meta;
  }
}

function getChangedKeys(metadata: unknown): string[] {
  metadata = normalizeMetadata(metadata);
  if (!metadata || typeof metadata !== "object") return [];
  if (!("changed_keys" in metadata)) return [];
  const v = (metadata as { changed_keys?: unknown }).changed_keys;
  return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
}

function deriveChangedKeysFromOldNew(metadata: unknown): string[] {
  metadata = normalizeMetadata(metadata);
  if (!metadata || typeof metadata !== "object") return [];
  const m = metadata as { old?: unknown; new?: unknown; op?: unknown };
  if (typeof m.op === "string" && m.op !== "UPDATE") return [];
  if (!m.old || !m.new || typeof m.old !== "object" || typeof m.new !== "object") return [];
  const oldObj = m.old as Record<string, unknown>;
  const newObj = m.new as Record<string, unknown>;
  const keys = new Set<string>([...Object.keys(oldObj), ...Object.keys(newObj)]);
  const changed: string[] = [];
  for (const k of keys) {
    const a = oldObj[k];
    const b = newObj[k];
    const same =
      a === b ||
      (() => {
        try {
          return JSON.stringify(a) === JSON.stringify(b);
        } catch {
          return false;
        }
      })();
    if (!same) changed.push(k);
  }
  return changed;
}

function getAnyChangedKeys(metadata: unknown): string[] {
  const direct = getChangedKeys(metadata);
  if (direct.length) return direct;
  return deriveChangedKeysFromOldNew(metadata);
}

function isNoopUpdate(metadata: unknown): boolean {
  metadata = normalizeMetadata(metadata);
  if (!metadata || typeof metadata !== "object") return false;
  const m = metadata as { old?: unknown; new?: unknown; op?: unknown };
  if (m.op !== "UPDATE") return false;
  try {
    return JSON.stringify(m.old ?? null) === JSON.stringify(m.new ?? null);
  } catch {
    return false;
  }
}

function isTimestampOnlyUpdate(metadata: unknown): boolean {
  metadata = normalizeMetadata(metadata);
  if (!metadata || typeof metadata !== "object") return false;
  const m = metadata as { op?: unknown };
  if (m.op !== "UPDATE") return false;
  const changed = getAnyChangedKeys(metadata);
  if (changed.length === 0) return false;
  const noisy = new Set([
    "updated_at",
    "created_at",
    "allocated_at",
    "decided_at",
    "escalated_at",
    "assigned_at",
    "sent_at",
    "enrolled_at",
  ]);
  return changed.every((k) => noisy.has(k));
}

function getChanges(metadata: unknown): unknown {
  metadata = normalizeMetadata(metadata);
  if (!metadata || typeof metadata !== "object") return null;
  if (!("changes" in metadata)) return null;
  return (metadata as { changes?: unknown }).changes ?? null;
}

type VisualDiffEntry = {
  key: string;
  oldValue: unknown;
  newValue: unknown;
};

function formatDiffValue(v: unknown) {
  if (v === null) return "null";
  if (v === undefined) return "—";
  if (typeof v === "string") return v.length > 260 ? `${v.slice(0, 260)}…` : v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  try {
    const s = JSON.stringify(v);
    return s.length > 260 ? `${s.slice(0, 260)}…` : s;
  } catch {
    return String(v);
  }
}

function getVisualDiffEntries(metadata: unknown, activityTitlesById: Record<string, string>): VisualDiffEntry[] {
  metadata = normalizeMetadata(metadata);

  const changesRaw = decorateChanges(getChanges(metadata), activityTitlesById);
  if (changesRaw && typeof changesRaw === "object") {
    const obj = changesRaw as Record<string, unknown>;
    const entries: VisualDiffEntry[] = [];
    for (const [key, value] of Object.entries(obj)) {
      if (!value || typeof value !== "object") continue;
      const vv = value as { old?: unknown; new?: unknown };
      if (!("old" in vv) && !("new" in vv)) continue;
      entries.push({ key, oldValue: vv.old, newValue: vv.new });
    }
    if (entries.length) return entries.sort((a, b) => a.key.localeCompare(b.key));
  }

  if (!metadata || typeof metadata !== "object") return [];
  const m = metadata as { old?: unknown; new?: unknown; op?: unknown };
  if (typeof m.op === "string" && m.op !== "UPDATE") return [];
  if (!m.old || !m.new || typeof m.old !== "object" || typeof m.new !== "object") return [];

  const oldObj = m.old as Record<string, unknown>;
  const newObj = m.new as Record<string, unknown>;
  const keys = deriveChangedKeysFromOldNew(metadata);
  return keys
    .map((k) => ({ key: k, oldValue: oldObj[k], newValue: newObj[k] }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

export default function AuditPage() {
  const supabase = useMemo(() => createClient(), []);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<AuditLogRowWithActor | null>(null);
  const pageSize = 25;
  const fetchWindow = 500;

  const [filterTable, setFilterTable] = useState<string>("");
  const [filterAction, setFilterAction] = useState<string>("");
  const [filterCourseId, setFilterCourseId] = useState<string>("");
  const [filterActor, setFilterActor] = useState<string>("");
  const [filterOp, setFilterOp] = useState<string>("");
  const [filterFrom, setFilterFrom] = useState<string>("");
  const [filterTo, setFilterTo] = useState<string>("");

  async function signOut() {
    await fetch("/api/auth/signout", { method: "POST" });
    window.location.href = "/login";
  }

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
    queryKey: ["audit-logs", { search }],
    enabled: auditCheckQuery.data?.isAudit === true,
    queryFn: async () => {
      const q = search.trim().toLowerCase();

      const res = await supabase
        .from("audit_logs")
        .select("id,created_at,actor_id,action,entity_table,entity_id,course_id,message,metadata", { count: "exact" })
        .order("created_at", { ascending: false })
        .limit(fetchWindow);

      if (res.error) throw res.error;
      let rows = (res.data ?? []) as AuditLogRow[];

      const actorIds = Array.from(new Set(rows.map((r) => r.actor_id).filter((x): x is string => typeof x === "string" && x.length > 0)));
      const actorsById = new Map<string, ActorRow>();
      if (actorIds.length) {
        const actorsRes = await supabase.from("app_users").select("id,full_name,email").in("id", actorIds);
        if (!actorsRes.error) {
          for (const a of (actorsRes.data ?? []) as ActorRow[]) actorsById.set(a.id, a);
        }
      }
      rows = rows.map((r) => ({ ...r, actor: r.actor_id ? actorsById.get(r.actor_id) ?? null : null })) as AuditLogRowWithActor[];

      const activityIds = new Set<number>();
      for (const r of rows) {
        const metaText =
          typeof r.metadata === "string"
            ? r.metadata
            : (() => {
                try {
                  return JSON.stringify(r.metadata);
                } catch {
                  return "";
                }
              })();
        for (const id of extractActivityIdsFromText(metaText)) activityIds.add(id);
      }

      const activityTitlesById = new Map<number, string>();
      const ids = Array.from(activityIds);
      if (ids.length) {
        const [courseActsRes, adminActsRes] = await Promise.all([
          supabase.from("course_activities").select("id,title").in("id", ids),
          supabase.from("admin_activities").select("id,title").in("id", ids),
        ]);
        if (!courseActsRes.error) {
          for (const a of (courseActsRes.data ?? []) as Array<{ id: number; title: string }>) activityTitlesById.set(a.id, a.title);
        }
        if (!adminActsRes.error) {
          for (const a of (adminActsRes.data ?? []) as Array<{ id: number; title: string }>) activityTitlesById.set(a.id, a.title);
        }
      }

      if (q) {
        rows = rows.filter((r) => {
          const hay = `${r.action ?? ""} ${r.entity_table ?? ""} ${r.entity_id ?? ""} ${r.course_id ?? ""} ${r.message ?? ""} ${
            typeof r.metadata === "string" ? r.metadata : ""
          }`.toLowerCase();
          return hay.includes(q);
        });
      }

      return {
        rows: rows as AuditLogRowWithActor[],
        dbTotal: res.count ?? 0,
        activityTitlesById: Object.fromEntries(activityTitlesById),
      };
    },
  });

  const allRows = (logsQuery.data?.rows ?? []) as AuditLogRowWithActor[];
  const dbTotal = (logsQuery.data as { dbTotal?: number } | undefined)?.dbTotal ?? 0;
  const activityTitlesById = (logsQuery.data as { activityTitlesById?: Record<string, string> } | undefined)?.activityTitlesById ?? {};

  const filteredRows = useMemo(() => {
    const tableQ = filterTable.trim().toLowerCase();
    const actionQ = filterAction.trim().toLowerCase();
    const actorQ = filterActor.trim().toLowerCase();
    const opQ = filterOp.trim().toUpperCase();
    const cid = Number(filterCourseId);
    const hasCid = filterCourseId.trim() !== "" && Number.isFinite(cid);

    const fromMs = filterFrom ? new Date(filterFrom).getTime() : null;
    const toMs = filterTo ? new Date(filterTo).getTime() : null;

    return allRows.filter((r) => {
      if (tableQ && (r.entity_table ?? "").toLowerCase() !== tableQ) return false;
      if (actionQ && !(r.action ?? "").toLowerCase().includes(actionQ)) return false;
      if (hasCid && Number(r.course_id ?? -1) !== cid) return false;

      if (actorQ) {
        const a = getActor(r.actor);
        const hay = `${a?.full_name ?? ""} ${a?.email ?? ""} ${r.actor_id ?? ""}`.toLowerCase();
        if (!hay.includes(actorQ)) return false;
      }

      if (opQ) {
        const meta = normalizeMetadata(r.metadata);
        const m = meta && typeof meta === "object" ? (meta as { op?: unknown }) : null;
        const op = typeof m?.op === "string" ? m.op.toUpperCase() : "";
        if (op !== opQ) return false;
      }

      if (fromMs != null || toMs != null) {
        const t = new Date(r.created_at).getTime();
        if (fromMs != null && Number.isFinite(fromMs) && t < fromMs) return false;
        if (toMs != null && Number.isFinite(toMs) && t > toMs) return false;
      }

      return true;
    });
  }, [allRows, filterAction, filterActor, filterCourseId, filterFrom, filterOp, filterTable, filterTo]);

  const filteredTotal = filteredRows.length;
  const start = (page - 1) * pageSize;
  const displayRows = filteredRows.slice(start, start + pageSize);

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
          <div className="mt-5 flex flex-wrap gap-2">
            <Button asChild size="sm">
              <Link href="/login">Logare</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/register">Inregistrare</Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link href="/">Inapoi acasa</Link>
            </Button>
          </div>
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
          <div className="mt-5 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={signOut}>
              Delogare
            </Button>
            <Button asChild size="sm">
              <Link href="/">Inapoi acasa</Link>
            </Button>
          </div>
        </section>
      </main>
    );
  }

  const exportJson = () => {
    const data = filteredRows.map((r) => ({
      id: r.id,
      created_at: r.created_at,
      actor_id: r.actor_id,
      actor: r.actor,
      action: r.action,
      entity_table: r.entity_table,
      entity_id: r.entity_id,
      course_id: r.course_id,
      message: r.message,
      metadata: normalizeMetadata(r.metadata),
    }));
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit_export_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const exportCsv = () => {
    const headers = ["id", "created_at", "action", "entity_table", "entity_id", "course_id", "actor", "actor_id", "message"];
    const rows = filteredRows.map((r) => {
      const a = getActor(r.actor);
      const actorLabel = (a?.full_name?.trim() || a?.email || "") as string;
      const values = [
        String(r.id),
        String(r.created_at),
        String(r.action ?? ""),
        String(r.entity_table ?? ""),
        String(r.entity_id ?? ""),
        String(r.course_id ?? ""),
        actorLabel,
        String(r.actor_id ?? ""),
        String(r.message ?? ""),
      ];
      const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
      return values.map((v) => esc(v)).join(",");
    });

    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit_export_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const applyPreset = (preset: "today" | "24h" | "7d" | "30d") => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const toLocalInput = (d: Date) =>
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

    let from: Date;
    if (preset === "today") {
      from = new Date(now);
      from.setHours(0, 0, 0, 0);
    } else {
      const hours = preset === "24h" ? 24 : preset === "7d" ? 24 * 7 : 24 * 30;
      from = new Date(now.getTime() - hours * 60 * 60 * 1000);
    }
    setFilterFrom(toLocalInput(from));
    setFilterTo(toLocalInput(now));
    setPage(1);
  };

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-10 pb-14 md:px-6">
      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">Audit</p>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">Jurnal</h1>
          <p className="text-sm text-muted-foreground">Evenimente generate automat.</p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/">Inapoi</Link>
        </Button>
      </header>

      <Card className="shadow-sm">
        <CardHeader className="space-y-2">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <CardTitle className="text-lg font-semibold tracking-tight">Audit logs</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                Afisate: <span className="font-mono text-foreground">{filteredTotal}</span>
                <span className="ml-2 text-muted-foreground">(din {dbTotal} în DB, ultimele {fetchWindow})</span>
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" onClick={exportJson} disabled={filteredTotal === 0}>
                Export JSON
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={exportCsv} disabled={filteredTotal === 0}>
                Export CSV
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="sticky top-[60px] z-[1] border-b border-border/60 bg-card/90 backdrop-blur supports-[backdrop-filter]:bg-card/70">
            <div className="p-5">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                <div className="w-full space-y-1 lg:max-w-xl">
                  <Label htmlFor="audit-search" className="text-xs">
                    Cauta
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

                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" size="sm" variant="ghost" onClick={() => applyPreset("today")}>
                    Azi
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => applyPreset("24h")}>
                    24h
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => applyPreset("7d")}>
                    7 zile
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => applyPreset("30d")}>
                    30 zile
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setFilterFrom("");
                      setFilterTo("");
                      setPage(1);
                    }}
                  >
                    Reset date
                  </Button>
                  <div className="h-6 w-px bg-border/60" />
                  <Pagination variant="compact" page={page} pageSize={pageSize} totalItems={filteredTotal} onPageChange={setPage} />
                </div>
              </div>

              <details className="mt-4 rounded-md border border-border/60 bg-muted/10 p-4">
                <summary className="cursor-pointer select-none text-xs font-medium text-foreground">Filtre avansate</summary>
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <div className="space-y-1">
                    <Label className="text-xs" htmlFor="audit-table">
                      Table
                    </Label>
                    <Input
                      id="audit-table"
                      value={filterTable}
                      onChange={(e) => {
                        setFilterTable(e.target.value);
                        setPage(1);
                      }}
                      placeholder="ex: courses"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs" htmlFor="audit-action">
                      Action
                    </Label>
                    <Input
                      id="audit-action"
                      value={filterAction}
                      onChange={(e) => {
                        setFilterAction(e.target.value);
                        setPage(1);
                      }}
                      placeholder="ex: role_"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs" htmlFor="audit-op">
                      OP
                    </Label>
                    <Input
                      id="audit-op"
                      value={filterOp}
                      onChange={(e) => {
                        setFilterOp(e.target.value);
                        setPage(1);
                      }}
                      placeholder="INSERT/UPDATE/DELETE"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs" htmlFor="audit-course">
                      Course ID
                    </Label>
                    <Input
                      id="audit-course"
                      value={filterCourseId}
                      onChange={(e) => {
                        setFilterCourseId(e.target.value);
                        setPage(1);
                      }}
                      placeholder="ex: 2"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs" htmlFor="audit-actor">
                      Actor
                    </Label>
                    <Input
                      id="audit-actor"
                      value={filterActor}
                      onChange={(e) => {
                        setFilterActor(e.target.value);
                        setPage(1);
                      }}
                      placeholder="email / nume / id"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs" htmlFor="audit-from">
                        From
                      </Label>
                      <Input
                        id="audit-from"
                        type="datetime-local"
                        value={filterFrom}
                        onChange={(e) => {
                          setFilterFrom(e.target.value);
                          setPage(1);
                        }}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs" htmlFor="audit-to">
                        To
                      </Label>
                      <Input
                        id="audit-to"
                        type="datetime-local"
                        value={filterTo}
                        onChange={(e) => {
                          setFilterTo(e.target.value);
                          setPage(1);
                        }}
                      />
                    </div>
                  </div>
                </div>
              </details>
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
          ) : displayRows.length === 0 ? (
            <div className="p-4">
              <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
                Nu exista log-uri.
              </div>
            </div>
          ) : (
            <div className="max-h-[74vh] overflow-auto">
              <div className="max-w-full overflow-x-auto">
                <Table>
                <TableHeader className="sticky top-0 z-10 bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/70">
                  <TableRow>
                    <TableHead className="px-5 py-4">Timp</TableHead>
                    <TableHead className="px-5 py-4">Actiune</TableHead>
                    <TableHead className="px-5 py-4">Entity</TableHead>
                    <TableHead className="px-5 py-4 text-right">Curs</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayRows.map((r) => {
                    const changed = getAnyChangedKeys(r.metadata);
                    const showChanged = changed.length > 0;
                    const openRow = () => setSelected(r);
                    const a = getActor(r.actor);
                    const actorLabel = a?.full_name?.trim() || a?.email || (r.actor_id ? r.actor_id : null);
                    const actorLabelShort =
                      actorLabel && actorLabel.includes("-") ? `${actorLabel.slice(0, 8)}…${actorLabel.slice(-4)}` : actorLabel;
                    return (
                      <TableRow
                        key={r.id}
                        role="button"
                        tabIndex={0}
                        onClick={openRow}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            openRow();
                          }
                        }}
                        className="cursor-pointer hover:bg-muted/20"
                      >
                        <TableCell onClick={openRow} className="px-5 py-4 text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                          {new Date(r.created_at).toLocaleString()}
                        </TableCell>
                        <TableCell onClick={openRow} className="px-5 py-4">
                          <div className="flex flex-col gap-1.5">
                            <div className="flex flex-wrap items-center gap-2">
                              <div className="text-sm font-semibold text-foreground">{r.action}</div>
                              {showChanged
                                ? changed.slice(0, 3).map((k) => (
                                    <Badge key={`${r.id}-${k}`} variant="outline" className="text-[10px]">
                                      {k}
                                    </Badge>
                                  ))
                                : null}
                            </div>
                            {actorLabelShort ? <div className="text-[11px] text-muted-foreground">by: {actorLabelShort}</div> : null}
                            {r.message ? <div className="text-[11px] text-muted-foreground">{r.message}</div> : null}
                          </div>
                        </TableCell>
                        <TableCell onClick={openRow} className="px-5 py-4 text-xs text-muted-foreground">
                          <div className="flex flex-wrap items-center gap-2">
                            {r.entity_table ? <Badge variant="secondary">{r.entity_table}</Badge> : <Badge variant="outline">n/a</Badge>}
                            {r.entity_id ? <span className="font-mono">{r.entity_id}</span> : null}
                          </div>
                        </TableCell>
                        <TableCell onClick={openRow} className="px-5 py-4 text-right text-xs text-muted-foreground whitespace-nowrap">
                          {r.course_id ?? "-"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
                </Table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      <Dialog open={Boolean(selected)} onOpenChange={(open) => (!open ? setSelected(null) : null)}>
        <DialogContent forceMount className="max-h-[86vh] max-w-5xl overflow-hidden p-0">
          {selected ? (
            <div className="overflow-hidden rounded-lg">
              <DialogHeader className="space-y-2 border-b border-border/60 px-6 py-5">
                <DialogTitle className="text-lg font-semibold tracking-tight">
                  #{selected.id} · <span className="font-mono">{selected.action}</span>
                </DialogTitle>
                <DialogDescription className="text-xs">
                  {new Date(selected.created_at).toLocaleString()}
                  {(() => {
                    const a = getActor(selected.actor);
                    const label = a?.full_name?.trim() || a?.email || (selected.actor_id ? selected.actor_id : null);
                    const short = label && label.includes("-") ? `${label.slice(0, 8)}…${label.slice(-4)}` : label;
                    return label ? (
                    <>
                      {" "}
                      · by:{" "}
                      <span className="font-mono">
                        {short}
                      </span>
                    </>
                    ) : null;
                  })()}
                  {" "}·{" "}
                  <span className="font-mono">
                    {selected.entity_table ?? "n/a"}
                    {selected.entity_id ? ` · ${selected.entity_id}` : ""}
                    {selected.course_id ? ` · course#${selected.course_id}` : ""}
                  </span>
                </DialogDescription>
              </DialogHeader>

              <div className="max-h-[calc(86vh-92px)] px-6 py-5">
                {selected.message ? <div className="mb-4 text-sm text-foreground">{selected.message}</div> : null}

                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="min-w-0">
                    <div className="mb-2 text-xs font-medium text-foreground">Schimbari</div>
                    <div className="max-h-[52vh] overflow-auto rounded-md border border-border/60 bg-muted/10 p-4">
                      {(() => {
                        const entries = getVisualDiffEntries(selected.metadata, activityTitlesById);
                        const changedKeys = entries.map((e) => e.key);
                        const limited = entries.slice(0, 32);
                        return entries.length ? (
                          <div>
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="text-xs text-muted-foreground">
                                {entries.length} chei{entries.length > limited.length ? ` (primele ${limited.length})` : ""}
                              </div>
                            </div>

                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {changedKeys.slice(0, 14).map((k) => (
                                <Badge key={`diffkey-${selected.id}-${k}`} variant="outline" className="text-[10px]">
                                  {k}
                                </Badge>
                              ))}
                              {changedKeys.length > 14 ? (
                                <Badge variant="secondary" className="text-[10px]">
                                  +{changedKeys.length - 14}
                                </Badge>
                              ) : null}
                            </div>

                            <div className="mt-3 overflow-x-auto rounded-md border border-border/60 bg-background/40">
                              <div className="min-w-[640px] grid grid-cols-[170px_1fr_1fr] gap-px bg-border/60">
                                <div className="bg-muted/10 px-3 py-2 text-[11px] font-medium text-muted-foreground">Cheie</div>
                                <div className="bg-muted/10 px-3 py-2 text-[11px] font-medium text-muted-foreground">Old</div>
                                <div className="bg-muted/10 px-3 py-2 text-[11px] font-medium text-muted-foreground">New</div>
                                {limited.map((e) => (
                                  <Fragment key={`row-${selected.id}-${e.key}`}>
                                    <div className="bg-card px-3 py-2 text-xs font-mono text-foreground">{e.key}</div>
                                    <div className="bg-card px-3 py-2 text-xs font-mono text-muted-foreground">
                                      {formatDiffValue(e.oldValue)}
                                    </div>
                                    <div className="bg-card px-3 py-2 text-xs font-mono text-foreground">
                                      {formatDiffValue(e.newValue)}
                                    </div>
                                  </Fragment>
                                ))}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="text-sm text-muted-foreground">Nu exista diferente detectabile.</div>
                        );
                      })()}
                    </div>
                  </div>

                  <div className="min-w-0">
                    <div className="mb-2 text-xs font-medium text-foreground">Metadata (full)</div>
                    <pre className="max-h-[52vh] overflow-auto rounded-md border border-border/60 bg-muted/10 p-4 text-xs text-muted-foreground">
                      {prettyJson(selected.metadata)}
                    </pre>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

    </main>
  );
}

