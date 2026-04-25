"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/utils/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ChartContainer, ChartLegend, ChartTooltip } from "@/components/ui/chart";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, XAxis, YAxis } from "recharts";

type ResourceType = "tokens" | "vps_subscription";

type StudentResourceRow = {
  course_id: number;
  student_id: string;
  resource_type: ResourceType;
  granted_amount: number;
  consumed_amount: number;
};

type TokenActivityRow = {
  course_id: number;
  student_id: string;
  tokens_used: number;
  note: string | null;
  created_at: string;
};

type AllocationRow = {
  course_id: number;
  resource_type: ResourceType;
  allocated_amount: number;
  professor_bonus_amount: number;
  professor_bonus_remaining: number;
};

type AppUserRow = {
  id: string;
  email: string;
  full_name: string | null;
};

type ActivityTitleRow = {
  id: number;
  title: string;
};

function getErrorMessage(err: unknown) {
  if (!err) return "Eroare necunoscuta.";
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && "message" in err && typeof (err as { message?: unknown }).message === "string") {
    return (err as { message: string }).message;
  }
  return "Eroare la request.";
}

function extractActivityId(note: string): number | null {
  const m = note.match(/(?:^|\s)activity_id=(\d+)(?:\s|$)/i);
  if (!m) return null;
  const id = Number(m[1]);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function sumByResource(rows: StudentResourceRow[]) {
  const out: Record<ResourceType, { allocated: number; used: number }> = {
    tokens: { allocated: 0, used: 0 },
    vps_subscription: { allocated: 0, used: 0 },
  };
  for (const r of rows) {
    out[r.resource_type].allocated += r.granted_amount ?? 0;
    out[r.resource_type].used += r.consumed_amount ?? 0;
  }
  return out;
}

function groupTokenUsageByActivity(rows: TokenActivityRow[]) {
  const map = new Map<string, number>();
  for (const r of rows) {
    const key = (r.note ?? "").trim() || "unknown";
    map.set(key, (map.get(key) ?? 0) + (r.tokens_used ?? 0));
  }
  return Array.from(map.entries())
    .map(([note, used]) => ({ note, used }))
    .sort((a, b) => b.used - a.used);
}

export default function AdminStatisticiPage() {
  const supabase = useMemo(() => createClient(), []);
  const [view, setView] = useState<"student" | "course" | "university">("university");
  const [courseIdInput, setCourseIdInput] = useState<string>("");
  const [studentEmail, setStudentEmail] = useState<string>("");

  async function signOut() {
    await fetch("/api/auth/signout", { method: "POST" });
    window.location.href = "/login";
  }

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

  const resolvedCourseId = Number(courseIdInput);
  const courseId = Number.isFinite(resolvedCourseId) && resolvedCourseId > 0 ? resolvedCourseId : null;
  const email = studentEmail.trim().toLowerCase();

  const resolveStudentQuery = useQuery({
    queryKey: ["admin-stats-resolve-student", { email }],
    enabled: adminCheckQuery.data?.isAdmin === true && view === "student" && Boolean(email),
    queryFn: async () => {
      const { data, error } = await supabase.from("app_users").select("id,email,full_name").ilike("email", email).limit(1);
      if (error) throw error;
      return ((data ?? [])[0] ?? null) as AppUserRow | null;
    },
  });

  const studentId = resolveStudentQuery.data?.id ?? null;

  const statsQuery = useQuery({
    queryKey: ["admin-stats", { view, courseId, studentId, email }],
    enabled:
      adminCheckQuery.data?.isAdmin === true &&
      (view === "university" || (view === "course" && Boolean(courseId)) || (view === "student" && Boolean(studentId))),
    queryFn: async () => {
      const resourceQ = supabase.from("course_student_resources").select("course_id,student_id,resource_type,granted_amount,consumed_amount");
      const tokenQ = supabase.from("course_token_activities").select("course_id,student_id,tokens_used,note,created_at");
      const allocQ = supabase
        .from("course_resource_allocations")
        .select("course_id,resource_type,allocated_amount,professor_bonus_amount,professor_bonus_remaining");

      if (view === "course" && courseId) {
        resourceQ.eq("course_id", courseId);
        tokenQ.eq("course_id", courseId);
        allocQ.eq("course_id", courseId);
      }
      if (view === "student" && studentId) {
        resourceQ.eq("student_id", studentId);
        tokenQ.eq("student_id", studentId);
      }

      const [res1, res2, res3] = await Promise.all([resourceQ, tokenQ, allocQ]);
      if (res1.error) throw res1.error;
      if (res2.error) throw res2.error;
      if (res3.error) throw res3.error;

      const resources = (res1.data ?? []) as StudentResourceRow[];
      const tokens = (res2.data ?? []) as TokenActivityRow[];
      const allocations = (res3.data ?? []) as AllocationRow[];

      const totals = sumByResource(resources);
      const byActivity = groupTokenUsageByActivity(tokens);

      const activityIds = Array.from(
        new Set(
          byActivity
            .map((x) => extractActivityId(x.note))
            .filter((x): x is number => typeof x === "number" && Number.isFinite(x) && x > 0),
        ),
      );

      const activityTitlesById = new Map<number, string>();
      if (activityIds.length) {
        const [courseActsRes, adminActsRes] = await Promise.all([
          supabase.from("course_activities").select("id,title").in("id", activityIds),
          supabase.from("admin_activities").select("id,title").in("id", activityIds),
        ]);

        if (!courseActsRes.error) {
          for (const a of (courseActsRes.data ?? []) as ActivityTitleRow[]) activityTitlesById.set(a.id, a.title);
        }
        if (!adminActsRes.error) {
          for (const a of (adminActsRes.data ?? []) as ActivityTitleRow[]) activityTitlesById.set(a.id, a.title);
        }
      }

      const allocatedByType: Record<ResourceType, number> = { tokens: 0, vps_subscription: 0 };
      for (const a of allocations) allocatedByType[a.resource_type] += a.allocated_amount ?? 0;

      return { resources, tokens, allocations, totals, byActivity, allocatedByType, activityTitlesById: Object.fromEntries(activityTitlesById) };
    },
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
          <div className="mt-4 flex flex-wrap gap-2">
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

  if (!adminCheckQuery.data?.isAdmin) {
    return (
      <main className="flex min-h-[70vh] items-center justify-center px-4 py-8">
        <section className="w-full max-w-md bg-card p-6">
          <h1 className="font-mono text-xl font-semibold text-foreground">Acces interzis</h1>
          <p className="mt-2 text-sm text-muted-foreground">Doar utilizatorii cu rol admin pot vedea statisticile.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={signOut}>
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

  const totals = statsQuery.data?.totals ?? { tokens: { allocated: 0, used: 0 }, vps_subscription: { allocated: 0, used: 0 } };
  const byActivity = statsQuery.data?.byActivity ?? [];
  const activityTitlesById = (statsQuery.data as { activityTitlesById?: Record<string, string> } | undefined)?.activityTitlesById ?? {};
  const byActivityChart = byActivity.slice(0, 10).map((r) => {
    const id = extractActivityId(r.note);
    const title = id ? activityTitlesById[String(id)] : null;
    return {
      label: title ? `${title} (#${id})` : r.note,
      used: r.used,
    };
  });

  const allocationChartTokens = [
    { name: "Token-uri folosite", value: totals.tokens.used, fill: "hsl(var(--primary))" },
    { name: "Token-uri ramase", value: Math.max(0, totals.tokens.allocated - totals.tokens.used), fill: "hsl(var(--muted))" },
  ];

  const allocationChartVps = [
    { name: "Abonamente utilizate", value: totals.vps_subscription.used, fill: "hsl(var(--primary))" },
    { name: "Abonamente ramase", value: Math.max(0, totals.vps_subscription.allocated - totals.vps_subscription.used), fill: "hsl(var(--muted))" },
  ];

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-4 py-8 md:px-6">
      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.24em] text-primary">Admin</p>
          <h1 className="mt-2 font-mono text-2xl font-semibold tracking-wider text-foreground">Statistici resurse</h1>
          <p className="mt-1 text-sm text-muted-foreground">Student / Curs / Universitate.</p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/admin">Inapoi</Link>
        </Button>
      </header>

      <div className="mb-6 grid grid-cols-3 gap-2 rounded-md bg-muted/10 p-1 sm:max-w-md">
        {(
          [
            ["university", "Universitate"],
            ["course", "Curs"],
            ["student", "Student"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setView(k)}
            className={[
              "h-9 rounded-md px-2 text-xs font-medium transition",
              view === k ? "bg-card shadow-2xs text-foreground" : "text-muted-foreground hover:text-foreground",
            ].join(" ")}
          >
            {label}
          </button>
        ))}
      </div>

      {view === "course" ? (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Filtru curs</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
            <div className="space-y-1">
              <Label className="text-xs" htmlFor="courseId">
                Course ID
              </Label>
              <Input id="courseId" value={courseIdInput} onChange={(e) => setCourseIdInput(e.target.value)} placeholder="ex: 2" />
            </div>
            <div className="text-xs text-muted-foreground">{courseId ? <Badge variant="secondary">course_id={courseId}</Badge> : "ID invalid"}</div>
          </CardContent>
        </Card>
      ) : null}

      {view === "student" ? (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Filtru student</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
            <div className="space-y-1">
              <Label className="text-xs" htmlFor="studentEmail">
                Email student
              </Label>
              <Input id="studentEmail" value={studentEmail} onChange={(e) => setStudentEmail(e.target.value)} placeholder="student@..." />
            </div>
            <div className="text-xs text-muted-foreground">
              {resolveStudentQuery.isLoading
                ? "Caut..."
                : resolveStudentQuery.data
                  ? `id=${resolveStudentQuery.data.id.slice(0, 8)}…`
                  : email
                    ? "Student negasit"
                    : "—"}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {statsQuery.isLoading ? (
        <div className="text-sm text-muted-foreground">Se incarca...</div>
      ) : statsQuery.isError ? (
        <div className="rounded-md bg-destructive/5 p-4 text-sm text-destructive">
          Eroare: <span className="font-mono text-xs">{getErrorMessage(statsQuery.error)}</span>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader className="space-y-1">
              <CardTitle className="text-base font-semibold tracking-tight">Sumar</CardTitle>
              <p className="text-xs text-muted-foreground">Alocări vs. consum.</p>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-md border border-border/60 bg-muted/10 p-3">
                <div className="text-xs text-muted-foreground">Token-uri alocate</div>
                <div className="mt-1 font-mono text-lg text-foreground">{totals.tokens.allocated}</div>
                <div className="mt-1 text-xs text-muted-foreground">Token-uri folosite: {totals.tokens.used}</div>
              </div>
              <div className="rounded-md border border-border/60 bg-muted/10 p-3">
                <div className="text-xs text-muted-foreground">Abonamente alocate</div>
                <div className="mt-1 font-mono text-lg text-foreground">{totals.vps_subscription.allocated}</div>
                <div className="mt-1 text-xs text-muted-foreground">Abonamente utilizate: {totals.vps_subscription.used}</div>
              </div>
              <div className="rounded-md border border-border/60 bg-muted/10 p-3 sm:col-span-2">
                <div className="text-xs text-muted-foreground">Total token-uri folosite (din activități)</div>
                <div className="mt-1 font-mono text-lg text-foreground">{(statsQuery.data?.tokens ?? []).reduce((s, x) => s + (x.tokens_used ?? 0), 0)}</div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="space-y-1">
              <CardTitle className="text-base font-semibold tracking-tight">Token-uri folosite pe activitate</CardTitle>
            </CardHeader>
            <CardContent>
              {byActivity.length === 0 ? (
                <div className="text-sm text-muted-foreground">Nu exista activitati inregistrate.</div>
              ) : (
                <div className="space-y-4">
                  <div className="rounded-md border border-border/60 bg-muted/10 p-3">
                    <ChartContainer className="h-[260px] w-full">
                      <BarChart data={byActivityChart} margin={{ left: 8, right: 12, top: 8, bottom: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                        <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={0} angle={-20} height={60} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <ChartTooltip />
                        <ChartLegend />
                        <Bar dataKey="used" name="Token-uri" radius={[6, 6, 0, 0]}>
                          {byActivityChart.map((_, idx) => (
                            <Cell key={idx} fill="hsl(var(--primary))" opacity={0.85} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ChartContainer>
                  </div>

                  <div className="overflow-hidden rounded-md border border-border/60 bg-muted/10">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Activitate</TableHead>
                          <TableHead className="text-right">Token-uri</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {byActivity.slice(0, 20).map((r) => (
                          <TableRow key={r.note}>
                            <TableCell className="max-w-[360px] truncate" title={r.note}>
                              {(() => {
                                const id = extractActivityId(r.note);
                                const title = id ? activityTitlesById[String(id)] : null;
                                if (id && title) return `${title} (activity_id=${id})`;
                                return r.note;
                              })()}
                            </TableCell>
                            <TableCell className="text-right font-mono text-xs text-muted-foreground">{r.used}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader className="space-y-1">
              <CardTitle className="text-base font-semibold tracking-tight">Token-uri: alocat vs folosit</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-[320px_1fr] md:items-center">
              <div className="rounded-md border border-border/60 bg-muted/10 p-3">
                <ChartContainer className="h-[240px] w-full" aspect="square">
                  <PieChart>
                    <ChartTooltip />
                    <Pie data={allocationChartTokens} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={3}>
                      {allocationChartTokens.map((x) => (
                        <Cell key={x.name} fill={x.fill} />
                      ))}
                    </Pie>
                  </PieChart>
                </ChartContainer>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between rounded-md border border-border/60 bg-muted/10 px-3 py-2">
                  <span className="text-muted-foreground">Token-uri alocate</span>
                  <span className="font-mono">{totals.tokens.allocated}</span>
                </div>
                <div className="flex items-center justify-between rounded-md border border-border/60 bg-muted/10 px-3 py-2">
                  <span className="text-muted-foreground">Token-uri folosite</span>
                  <span className="font-mono">{totals.tokens.used}</span>
                </div>
                <div className="flex items-center justify-between rounded-md border border-border/60 bg-muted/10 px-3 py-2">
                  <span className="text-muted-foreground">Token-uri ramase</span>
                  <span className="font-mono">{Math.max(0, totals.tokens.allocated - totals.tokens.used)}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader className="space-y-1">
              <CardTitle className="text-base font-semibold tracking-tight">Abonamente: alocat vs utilizat</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-[320px_1fr] md:items-center">
              <div className="rounded-md border border-border/60 bg-muted/10 p-3">
                <ChartContainer className="h-[240px] w-full" aspect="square">
                  <PieChart>
                    <ChartTooltip />
                    <Pie data={allocationChartVps} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={3}>
                      {allocationChartVps.map((x) => (
                        <Cell key={x.name} fill={x.fill} />
                      ))}
                    </Pie>
                  </PieChart>
                </ChartContainer>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between rounded-md border border-border/60 bg-muted/10 px-3 py-2">
                  <span className="text-muted-foreground">Abonamente alocate</span>
                  <span className="font-mono">{totals.vps_subscription.allocated}</span>
                </div>
                <div className="flex items-center justify-between rounded-md border border-border/60 bg-muted/10 px-3 py-2">
                  <span className="text-muted-foreground">Abonamente utilizate</span>
                  <span className="font-mono">{totals.vps_subscription.used}</span>
                </div>
                <div className="flex items-center justify-between rounded-md border border-border/60 bg-muted/10 px-3 py-2">
                  <span className="text-muted-foreground">Abonamente ramase</span>
                  <span className="font-mono">{Math.max(0, totals.vps_subscription.allocated - totals.vps_subscription.used)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </main>
  );
}

