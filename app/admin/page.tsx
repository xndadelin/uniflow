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
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-8">
      <header className="mb-6">
        <p className="font-mono text-xs uppercase tracking-[0.24em] text-primary">Admin</p>
        <h1 className="mt-2 font-mono text-2xl font-semibold tracking-wider text-foreground">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">Alege rapid ce vrei sa faci. Prioritar: cursurile fara alocari.</p>
      </header>

      <div className="grid gap-8 md:grid-cols-2 md:items-start">
        <Card>
          <CardHeader>
            <CardTitle className="font-mono text-sm">Actiuni rapide</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button asChild variant="outline" className="w-full justify-between">
              <Link href="/admin/inventar">
                <span>Inventar global</span>
                <span className="text-xs text-muted-foreground">total resurse</span>
              </Link>
            </Button>
            <Button asChild variant="outline" className="w-full justify-between">
              <Link href="/admin/roles">
                <span>Roluri</span>
                <span className="text-xs text-muted-foreground">user roles</span>
              </Link>
            </Button>
            <Button asChild variant="outline" className="w-full justify-between">
              <Link href="/admin/resurse">
                <span>Alocare & activitati</span>
                <span className="text-xs text-muted-foreground">per curs</span>
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-mono text-sm">Necesita alocare</CardTitle>
            <p className="text-xs text-muted-foreground">
              Cursuri cu necesar setat, dar fara alocare completa.
              <span className="ml-2 font-mono text-foreground">{coursesNeedingAllocation.length}</span>
            </p>
          </CardHeader>
          <CardContent>

        {dashboardQuery.isLoading ? (
          <div className="text-sm text-muted-foreground">Se incarca...</div>
        ) : dashboardQuery.isError ? (
          <div className="text-sm text-destructive">Eroare la incarcare.</div>
        ) : coursesNeedingAllocation.length === 0 ? (
          <div className="text-sm text-muted-foreground">Nu exista cursuri cu necesar setat si fara alocare.</div>
        ) : (
          <div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Curs</TableHead>
                  <TableHead>Lipsa alocare</TableHead>
                  <TableHead className="text-right">Actiune</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {coursesNeedingAllocation.map(({ course, missing }) => (
                  <TableRow key={course.id}>
                    <TableCell>
                      <div className="space-y-1">
                        <div className="text-sm font-medium">#{course.id} · {course.title}</div>
                        <div className="text-[11px] text-muted-foreground">max: {course.max_students}</div>
                      </div>
                    </TableCell>
                    <TableCell className="space-x-2">
                      {missing.map((m) => (
                        <Badge key={`${course.id}-${m.resource_type}`} variant="secondary">
                          {m.resource_type}
                        </Badge>
                      ))}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button asChild size="sm">
                        <Link href={`/admin/resurse?courseId=${course.id}`}>Deschide</Link>
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
      </div>

      <Card className="mt-8">
        <CardHeader>
          <CardTitle className="font-mono text-sm">Escalari la admin</CardTitle>
          <p className="text-xs text-muted-foreground">
            Cereri escaladate de profesori (cand bonusul 10% nu ajunge). Total:{" "}
            <span className="font-mono text-foreground">{escalated.length}</span>
          </p>
        </CardHeader>
        <CardContent>
          {dashboardQuery.isLoading ? (
            <div className="text-sm text-muted-foreground">Se incarca...</div>
          ) : dashboardQuery.isError ? (
            <div className="text-sm text-destructive">Eroare la incarcare.</div>
          ) : escalated.length === 0 ? (
            <div className="text-sm text-muted-foreground">Nu exista cereri escaladate.</div>
          ) : (
            <div className="overflow-hidden rounded-md bg-muted/10 divide-y divide-border/20">
              {escalated.map((r) => {
                const c = courses.find((x) => x.id === r.course_id);
                return (
                  <div key={r.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="space-y-1">
                      <div className="text-sm font-medium">
                        #{r.id} · {c ? `Curs #${c.id} · ${c.title}` : `Curs #${r.course_id}`}
                      </div>
                      <div className="flex flex-wrap gap-2 text-xs">
                        <Badge variant="outline">{r.resource_type}</Badge>
                        <Badge variant="outline">cantitate: {r.requested_amount}</Badge>
                      </div>
                    </div>
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/admin/resurse?courseId=${r.course_id}`}>Deschide</Link>
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="mt-8">
        <CardHeader>
          <CardTitle className="font-mono text-sm">Toate cursurile</CardTitle>
          <p className="text-xs text-muted-foreground">
            Intri direct pe un curs ca sa modifici alocari si activitati. Total:{" "}
            <span className="font-mono text-foreground">{courses.length}</span>
          </p>
        </CardHeader>
        <CardContent>

        {dashboardQuery.isLoading ? (
          <div className="text-sm text-muted-foreground">Se incarca...</div>
        ) : dashboardQuery.isError ? (
          <div className="text-sm text-destructive">Eroare la incarcare.</div>
        ) : courses.length === 0 ? (
          <div className="text-sm text-muted-foreground">Nu exista cursuri.</div>
        ) : (
          <div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Curs</TableHead>
                  <TableHead className="text-right">Max studenti</TableHead>
                  <TableHead className="text-right">Creat la</TableHead>
                  <TableHead className="text-right">Actiune</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {courses.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="text-sm font-medium text-foreground">#{c.id} · {c.title}</TableCell>
                    <TableCell className="text-right font-mono text-xs text-muted-foreground">{c.max_students}</TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">{new Date(c.created_at).toLocaleString()}</TableCell>
                    <TableCell className="text-right">
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/admin/resurse?courseId=${c.id}`}>Gestioneaza</Link>
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

