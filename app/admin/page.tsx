"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/utils/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

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
      const [coursesRes, reqRes, allocRes] = await Promise.all([
        supabase.from("courses").select("id,title,max_students,created_at").order("created_at", { ascending: false }),
        supabase.from("course_resource_requirements").select("course_id,resource_type,required_per_student"),
        supabase.from("course_resource_allocations").select("course_id,resource_type"),
      ]);

      if (coursesRes.error) throw coursesRes.error;
      if (reqRes.error) throw reqRes.error;
      if (allocRes.error) throw allocRes.error;

      return {
        courses: (coursesRes.data ?? []) as CourseRow[],
        requirements: (reqRes.data ?? []) as RequirementRow[],
        allocations: (allocRes.data ?? []) as AllocationRow[],
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

      <section className="grid gap-3 md:grid-cols-3">
        <Link href="/admin/inventar" className="rounded-lg border border-border bg-card p-4 transition hover:bg-muted/10">
          <div className="font-mono text-sm font-semibold text-foreground">Inventar global</div>
          <div className="mt-1 text-xs text-muted-foreground">Setezi totalul resurselor (inclusiv recomandarea +10%).</div>
        </Link>
        <Link href="/admin/roles" className="rounded-lg border border-border bg-card p-4 transition hover:bg-muted/10">
          <div className="font-mono text-sm font-semibold text-foreground">Roluri</div>
          <div className="mt-1 text-xs text-muted-foreground">Atribuire/modificare roluri utilizatori.</div>
        </Link>
        <Link href="/admin/resurse" className="rounded-lg border border-border bg-card p-4 transition hover:bg-muted/10">
          <div className="font-mono text-sm font-semibold text-foreground">Alocare & activitati</div>
          <div className="mt-1 text-xs text-muted-foreground">Aprobi (aloci) resurse pe curs + gestionezi activitati per curs.</div>
        </Link>
      </section>

      <section className="mt-6 rounded-lg border border-border bg-card p-4 md:p-6">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="font-mono text-sm font-semibold text-foreground">Cursuri fara alocare (necesita aprobare admin)</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Profesorul poate seta necesarul, dar studentii primesc resurse doar dupa ce adminul aloca.
            </p>
          </div>
          <div className="text-xs text-muted-foreground">
            Total: <span className="font-mono text-foreground">{coursesNeedingAllocation.length}</span>
          </div>
        </div>

        {dashboardQuery.isLoading ? (
          <div className="mt-4 text-sm text-muted-foreground">Se incarca...</div>
        ) : dashboardQuery.isError ? (
          <div className="mt-4 text-sm text-destructive">Eroare la incarcare.</div>
        ) : coursesNeedingAllocation.length === 0 ? (
          <div className="mt-4 rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
            Nu exista cursuri cu necesar setat si fara alocare.
          </div>
        ) : (
          <div className="mt-4">
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
                      <div className="space-y-0.5">
                        <div className="text-sm font-medium text-foreground">#{course.id} · {course.title}</div>
                        <div className="text-[11px] text-muted-foreground">max studenti: {course.max_students}</div>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {missing.map((m) => m.resource_type).join(", ")}
                    </TableCell>
                    <TableCell className="text-right">
                      <Link
                        href={`/admin/resurse?courseId=${course.id}`}
                        className="inline-flex items-center justify-center bg-primary px-3 py-2 text-xs font-semibold uppercase tracking-wide text-primary-foreground"
                      >
                        Deschide alocare
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <section className="mt-6 rounded-lg border border-border bg-card p-4 md:p-6">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="font-mono text-sm font-semibold text-foreground">Toate cursurile</h2>
            <p className="mt-1 text-xs text-muted-foreground">Intri direct pe un curs ca sa modifici alocari si activitati.</p>
          </div>
          <div className="text-xs text-muted-foreground">
            Total: <span className="font-mono text-foreground">{courses.length}</span>
          </div>
        </div>

        {dashboardQuery.isLoading ? (
          <div className="mt-4 text-sm text-muted-foreground">Se incarca...</div>
        ) : dashboardQuery.isError ? (
          <div className="mt-4 text-sm text-destructive">Eroare la incarcare.</div>
        ) : courses.length === 0 ? (
          <div className="mt-4 rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">Nu exista cursuri.</div>
        ) : (
          <div className="mt-4">
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
                      <Link
                        href={`/admin/resurse?courseId=${c.id}`}
                        className="inline-flex items-center justify-center bg-muted/30 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-foreground transition hover:bg-muted/50"
                      >
                        Gestioneaza
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </main>
  );
}

