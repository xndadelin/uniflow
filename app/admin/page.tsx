"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/utils/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type CourseRow = {
  id: number;
  title: string;
  max_students: number;
  created_at: string;
};

type RequirementRow = {
  course_id: number;
  resource_type: "tokens" | "vps_subscription";
  required_per_student: number;
};

type AllocationRow = {
  course_id: number;
  resource_type: "tokens" | "vps_subscription";
};

type EscalatedRequestRow = {
  id: number;
  course_id: number;
  student_id: string;
  resource_type: "tokens" | "vps_subscription";
  requested_amount: number;
  created_at: string;
};

export default function AdminHomePage() {
  const supabase = useMemo(() => createClient(), []);

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

  const dashboardQuery = useQuery({
    queryKey: ["admin-dashboard"],
    enabled: adminCheckQuery.data?.isAdmin === true,
    queryFn: async () => {
      const [coursesRes, reqRes, allocRes, escalatedRes] = await Promise.all([
        supabase.from("courses").select("id,title,max_students,created_at").order("created_at", { ascending: false }),
        supabase.from("course_resource_requirements").select("course_id,resource_type,required_per_student"),
        supabase.from("course_resource_allocations").select("course_id,resource_type"),
        supabase
          .from("course_resource_requests")
          .select("id,course_id,student_id,resource_type,requested_amount,created_at")
          .eq("status", "escalated")
          .order("created_at", { ascending: false })
          .limit(50),
      ]);

      if (coursesRes.error) throw coursesRes.error;
      if (reqRes.error) throw reqRes.error;
      if (allocRes.error) throw allocRes.error;
      if (escalatedRes.error) throw escalatedRes.error;

      return {
        courses: (coursesRes.data ?? []) as CourseRow[],
        requirements: (reqRes.data ?? []) as RequirementRow[],
        allocations: (allocRes.data ?? []) as AllocationRow[],
        escalated: (escalatedRes.data ?? []) as EscalatedRequestRow[],
      };
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
          <p className="mt-2 text-sm text-muted-foreground">Doar utilizatorii cu rol admin pot vedea dashboard-ul.</p>
          <Link href="/" className="mt-4 inline-flex bg-primary px-4 py-2 text-xs font-semibold uppercase tracking-wide text-primary-foreground">
            Inapoi acasa
          </Link>
        </section>
      </main>
    );
  }

  const courses = dashboardQuery.data?.courses ?? [];
  const requirements = dashboardQuery.data?.requirements ?? [];
  const allocations = dashboardQuery.data?.allocations ?? [];
  const escalated = (dashboardQuery.data as { escalated?: EscalatedRequestRow[] } | undefined)?.escalated ?? [];

  const allocKey = new Set(allocations.map((a) => `${a.course_id}:${a.resource_type}`));
  const reqByCourse = requirements.reduce<Record<number, RequirementRow[]>>((acc, r) => {
    if ((r.required_per_student ?? 0) <= 0) return acc;
    acc[r.course_id] = [...(acc[r.course_id] ?? []), r];
    return acc;
  }, {});

  const coursesNeedingAllocation = courses
    .map((c) => {
      const reqs = reqByCourse[c.id] ?? [];
      const missing = reqs.filter((r) => !allocKey.has(`${c.id}:${r.resource_type}`));
      return { course: c, missing };
    })
    .filter((x) => x.missing.length > 0);

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-10 pb-14 md:px-6">
      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">Admin</p>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">Dashboard</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline">
            <Link href="/admin/resurse">Deschide resurse</Link>
          </Button>
        </div>
      </header>

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded-md border border-border/60 bg-muted/10 px-4 py-3">
          <div className="text-xs text-muted-foreground">Cursuri</div>
          <div className="mt-1 font-mono text-2xl text-foreground">{courses.length}</div>
        </div>
        <div className="rounded-md border border-border/60 bg-muted/10 px-4 py-3">
          <div className="text-xs text-muted-foreground">Necesită alocare</div>
          <div className="mt-1 font-mono text-2xl text-foreground">{coursesNeedingAllocation.length}</div>
        </div>
        <div className="rounded-md border border-border/60 bg-muted/10 px-4 py-3">
          <div className="text-xs text-muted-foreground">Escalări</div>
          <div className="mt-1 font-mono text-2xl text-foreground">{escalated.length}</div>
        </div>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { href: "/admin/inventar", title: "Inventar", desc: "total resurse" },
          { href: "/admin/roles", title: "Roluri", desc: "utilizatori" },
          { href: "/admin/resurse", title: "Resurse", desc: "alocări & activități" },
          { href: "/admin/statistici", title: "Statistici", desc: "utilizare resurse" },
          { href: "/admin/outbox", title: "Outbox", desc: "emailuri simulate" },
        ].map((x) => (
          <Link
            key={x.href}
            href={x.href}
            className="group rounded-lg border border-border/60 bg-card px-4 py-4 transition hover:border-border hover:bg-muted/5"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-foreground">{x.title}</div>
                <div className="mt-1 text-xs text-muted-foreground">{x.desc}</div>
              </div>
              <span className="text-xs text-muted-foreground transition group-hover:text-foreground">→</span>
            </div>
          </Link>
        ))}
      </section>

      <div className="mt-8 grid gap-6 lg:grid-cols-2 lg:items-start">
        <Card className="shadow-sm">
          <CardHeader className="space-y-1 pb-6">
            <CardTitle className="text-base font-semibold tracking-tight">Necesită alocare</CardTitle>
            <p className="text-xs text-muted-foreground">Cursuri cu necesar setat, dar fără alocare completă.</p>
          </CardHeader>
          <CardContent className="p-0 pb-2">
            {dashboardQuery.isLoading ? (
              <div className="px-5 pb-5 text-sm text-muted-foreground">Se incarca...</div>
            ) : dashboardQuery.isError ? (
              <div className="px-5 pb-5 text-sm text-destructive">Eroare la incarcare.</div>
            ) : coursesNeedingAllocation.length === 0 ? (
              <div className="px-5 pb-5 text-sm text-muted-foreground">Totul e alocat.</div>
            ) : (
              <div className="overflow-hidden border-t border-border/60 pt-4">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="px-5 py-4">Curs</TableHead>
                      <TableHead className="px-5 py-4">Lipsește</TableHead>
                      <TableHead className="px-5 py-4 text-right">Acțiune</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {coursesNeedingAllocation.slice(0, 8).map(({ course, missing }) => (
                      <TableRow key={course.id} className="hover:bg-muted/20">
                        <TableCell className="px-5 py-4">
                          <div className="text-sm font-medium text-foreground">
                            #{course.id} · {course.title}
                          </div>
                          <div className="mt-1 text-[11px] text-muted-foreground">max: {course.max_students}</div>
                        </TableCell>
                        <TableCell className="px-5 py-4">
                          <div className="flex flex-wrap gap-2">
                            {missing.map((m) => (
                              <Badge key={`${course.id}-${m.resource_type}`} variant="secondary">
                                {m.resource_type}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="px-5 py-4 text-right">
                          <Button asChild size="sm" variant="outline">
                            <Link href={`/admin/resurse?courseId=${course.id}`}>Deschide</Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {coursesNeedingAllocation.length > 8 ? (
                  <div className="flex items-center justify-between border-t border-border/60 px-5 py-4">
                    <div className="text-xs text-muted-foreground">
                      Afișate: <span className="font-mono text-foreground">8</span> / {coursesNeedingAllocation.length}
                    </div>
                    <Button asChild size="sm" variant="ghost">
                      <Link href="/admin/resurse">Vezi toate</Link>
                    </Button>
                  </div>
                ) : null}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="space-y-1 pb-6">
            <CardTitle className="text-base font-semibold tracking-tight">Escalări la admin</CardTitle>
            <p className="text-xs text-muted-foreground">Cereri escaladate de profesori.</p>
          </CardHeader>
          <CardContent className="p-0 pb-2">
            {dashboardQuery.isLoading ? (
              <div className="px-5 pb-5 text-sm text-muted-foreground">Se incarca...</div>
            ) : dashboardQuery.isError ? (
              <div className="px-5 pb-5 text-sm text-destructive">Eroare la incarcare.</div>
            ) : escalated.length === 0 ? (
              <div className="px-5 pb-5 text-sm text-muted-foreground">Nu există escalări.</div>
            ) : (
              <div className="divide-y divide-border/50 border-t border-border/60 pt-4">
                {escalated.slice(0, 8).map((r) => {
                  const c = courses.find((x) => x.id === r.course_id);
                  return (
                    <div key={r.id} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="space-y-1">
                        <div className="text-sm font-medium text-foreground">
                          #{r.id} · {c ? `${c.title}` : `Curs #${r.course_id}`}
                        </div>
                        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                          <span className="font-mono">course#{r.course_id}</span>
                          <span>·</span>
                          <span className="font-mono">{r.resource_type}</span>
                          <span>·</span>
                          <span className="font-mono">+{r.requested_amount}</span>
                        </div>
                      </div>
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/admin/resurse?courseId=${r.course_id}`}>Deschide</Link>
                      </Button>
                    </div>
                  );
                })}
                {escalated.length > 8 ? (
                  <div className="flex items-center justify-between px-5 py-4">
                    <div className="text-xs text-muted-foreground">
                      Afișate: <span className="font-mono text-foreground">8</span> / {escalated.length}
                    </div>
                    <Button asChild size="sm" variant="ghost">
                      <Link href="/admin/resurse">Vezi în Resurse</Link>
                    </Button>
                  </div>
                ) : null}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-8 shadow-sm">
        <CardHeader className="flex flex-col gap-2 pb-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1">
            <CardTitle className="text-base font-semibold tracking-tight">Cursuri</CardTitle>
            <p className="text-xs text-muted-foreground">Intră pe un curs pentru alocări și activități.</p>
          </div>
          <Button asChild size="sm" variant="outline">
            <Link href="/admin/resurse">Toate cursurile</Link>
          </Button>
        </CardHeader>
        <CardContent className="p-0 pb-2">
          {dashboardQuery.isLoading ? (
            <div className="px-5 pb-5 text-sm text-muted-foreground">Se incarca...</div>
          ) : dashboardQuery.isError ? (
            <div className="px-5 pb-5 text-sm text-destructive">Eroare la incarcare.</div>
          ) : courses.length === 0 ? (
            <div className="px-5 pb-5 text-sm text-muted-foreground">Nu exista cursuri.</div>
          ) : (
            <div className="overflow-hidden border-t border-border/60 pt-2">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="px-5 py-4">Curs</TableHead>
                    <TableHead className="px-5 py-4 text-right">Max</TableHead>
                    <TableHead className="px-5 py-4 text-right">Creat</TableHead>
                    <TableHead className="px-5 py-4 text-right">Acțiune</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {courses.slice(0, 10).map((c) => (
                    <TableRow key={c.id} className="hover:bg-muted/20">
                      <TableCell className="px-5 py-4">
                        <div className="text-sm font-medium text-foreground">
                          #{c.id} · {c.title}
                        </div>
                      </TableCell>
                      <TableCell className="px-5 py-4 text-right font-mono text-xs text-muted-foreground">{c.max_students}</TableCell>
                      <TableCell className="px-5 py-4 text-right text-xs text-muted-foreground">
                        {new Date(c.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="px-5 py-4 text-right">
                        <Button asChild size="sm" variant="ghost">
                          <Link href={`/admin/resurse?courseId=${c.id}`}>Gestionează</Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}

