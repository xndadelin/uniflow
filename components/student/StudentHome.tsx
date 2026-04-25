"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { createClient } from "@/utils/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Pagination } from "@/components/Pagination";

type CourseRow = {
  id: number;
  teacher_id: string;
  title: string;
  description: string | null;
  enrollment_open: boolean;
  max_students: number;
  created_at: string;
};

type EnrollmentRow = {
  course_id: number;
  enrolled_at: string;
};

function getErrorMessage(err: unknown) {
  if (!err) return "Eroare necunoscuta.";
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && "message" in err && typeof (err as { message?: unknown }).message === "string") {
    return (err as { message: string }).message;
  }
  return "Eroare la request.";
}

export function StudentHome() {
  const supabase = useMemo(() => createClient(), []);
  const [enrolledPage, setEnrolledPage] = useState<number>(1);
  const [availablePage, setAvailablePage] = useState<number>(1);
  const [enrolledSearch, setEnrolledSearch] = useState<string>("");
  const [availableSearch, setAvailableSearch] = useState<string>("");
  const pageSize = 10;

  const meQuery = useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      return user;
    },
  });

  const coursesQuery = useQuery({
    queryKey: ["student-courses-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("courses")
        .select("id,teacher_id,title,description,enrollment_open,max_students,created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as CourseRow[];
    },
  });

  const enrollmentsQuery = useQuery({
    queryKey: ["student-enrollments"],
    queryFn: async () => {
      const { data, error } = await supabase.from("course_enrollments").select("course_id,enrolled_at");
      if (error) throw error;
      return (data ?? []) as EnrollmentRow[];
    },
  });

  const enrollMutation = useMutation({
    mutationFn: async (courseId: number) => {
      const { error } = await supabase.rpc("enroll_in_course", { _course_id: courseId });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Te-ai inrolat la curs.");
      await Promise.all([coursesQuery.refetch(), enrollmentsQuery.refetch()]);
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : "Nu s-a putut realiza inscrierea.";
      toast.error(message);
    },
  });

  const courses = coursesQuery.data ?? [];
  const enrolledSet = new Set((enrollmentsQuery.data ?? []).map((e) => e.course_id));
  const enrolledCourses = courses.filter((c) => enrolledSet.has(c.id));
  const availableCourses = courses.filter((c) => c.enrollment_open && !enrolledSet.has(c.id));

  const enrolledFiltered = enrolledSearch.trim()
    ? enrolledCourses.filter((c) => `${c.title} ${c.description ?? ""}`.toLowerCase().includes(enrolledSearch.trim().toLowerCase()))
    : enrolledCourses;
  const availableFiltered = availableSearch.trim()
    ? availableCourses.filter((c) => `${c.title} ${c.description ?? ""}`.toLowerCase().includes(availableSearch.trim().toLowerCase()))
    : availableCourses;

  const enrolledTotal = enrolledCourses.length;
  const availableTotal = availableCourses.length;
  const enrolledTotalFiltered = enrolledFiltered.length;
  const availableTotalFiltered = availableFiltered.length;
  const enrolledPaged = enrolledFiltered.slice((enrolledPage - 1) * pageSize, enrolledPage * pageSize);
  const availablePaged = availableFiltered.slice((availablePage - 1) * pageSize, availablePage * pageSize);

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-4 py-10 md:px-6 md:py-12">
      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">Student</p>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Cursuri, înscrieri și acces rapid la pagina fiecărui curs.</p>
        </div>
        <div className="flex flex-wrap gap-2" />
      </header>

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded-md border border-border/60 bg-muted/10 px-4 py-3">
          <div className="text-xs text-muted-foreground">Înscris</div>
          <div className="mt-1 font-mono text-2xl text-foreground">{enrolledTotal}</div>
          <div className="mt-1 text-xs text-muted-foreground">cursuri</div>
        </div>
        <div className="rounded-md border border-border/60 bg-muted/10 px-4 py-3">
          <div className="text-xs text-muted-foreground">Disponibile</div>
          <div className="mt-1 font-mono text-2xl text-foreground">{availableTotal}</div>
          <div className="mt-1 text-xs text-muted-foreground">cu înscriere deschisă</div>
        </div>
        <div className="rounded-md border border-border/60 bg-muted/10 px-4 py-3">
          <div className="text-xs text-muted-foreground">Cont</div>
          <div className="mt-1 truncate font-mono text-sm text-foreground">
            {meQuery.data?.email ?? "—"}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">autentificat</div>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-2 lg:items-start">
        <Card className="shadow-sm">
          <CardHeader className="flex flex-col gap-2 pb-6 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-1">
              <CardTitle className="text-base font-semibold tracking-tight">Cursurile mele</CardTitle>
              <p className="text-sm text-muted-foreground">Acces rapid la materiale, teme și resurse.</p>
            </div>
            <Badge variant="secondary">{enrolledTotalFiltered}</Badge>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div className="w-full sm:max-w-xs">
                <label className="text-xs text-muted-foreground">Cauta</label>
                <input
                  value={enrolledSearch}
                  onChange={(e) => {
                    setEnrolledSearch(e.target.value);
                    setEnrolledPage(1);
                  }}
                  placeholder="titlu / descriere..."
                  className="mt-1 w-full rounded-md border border-input/60 bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-ring"
                />
              </div>
              <Pagination
                variant="compact"
                page={enrolledPage}
                pageSize={pageSize}
                totalItems={enrolledTotalFiltered}
                onPageChange={setEnrolledPage}
              />
            </div>
        {enrollmentsQuery.isLoading || coursesQuery.isLoading ? (
          <div className="text-sm text-muted-foreground">Se incarca...</div>
        ) : enrolledTotalFiltered === 0 ? (
          <div className="text-sm text-muted-foreground">Nu esti inrolat la niciun curs inca.</div>
        ) : (
          <div className="overflow-hidden rounded-md border border-border/60 bg-muted/10">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="px-5 py-4">Curs</TableHead>
                  <TableHead className="px-5 py-4 text-right">Max</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {enrolledPaged.map((c) => (
                  <TableRow key={c.id} className="hover:bg-muted/20">
                    <TableCell className="min-w-[260px] px-5 py-4">
                      <div className="space-y-1">
                        <Link href={`/cursuri/${c.id}`} className="text-sm font-medium underline-offset-4 hover:underline">
                          {c.title}
                        </Link>
                        {c.description ? <div className="text-xs text-muted-foreground">{c.description}</div> : null}
                      </div>
                    </TableCell>
                    <TableCell className="px-5 py-4 text-right text-xs text-muted-foreground tabular-nums">{c.max_students}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="space-y-1 pb-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div className="space-y-1">
                <CardTitle className="text-base font-semibold tracking-tight">Cursuri disponibile</CardTitle>
                <p className="text-sm text-muted-foreground">Cursuri cu înscriere deschisă, la care nu ești înrolat încă.</p>
              </div>
              <Badge variant="secondary">{availableTotalFiltered}</Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div className="w-full sm:max-w-xs">
                <label className="text-xs text-muted-foreground">Cauta</label>
                <input
                  value={availableSearch}
                  onChange={(e) => {
                    setAvailableSearch(e.target.value);
                    setAvailablePage(1);
                  }}
                  placeholder="titlu / descriere..."
                  className="mt-1 w-full rounded-md border border-input/60 bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-ring"
                />
              </div>
              <Pagination
                variant="compact"
                page={availablePage}
                pageSize={pageSize}
                totalItems={availableTotalFiltered}
                onPageChange={setAvailablePage}
              />
            </div>

        {coursesQuery.isLoading ? (
          <div className="text-sm text-muted-foreground">Se incarca...</div>
        ) : coursesQuery.isError ? (
          <div className="rounded-md bg-destructive/5 p-4 text-sm text-destructive">
            Eroare la incarcarea cursurilor: <span className="font-mono text-xs">{getErrorMessage(coursesQuery.error)}</span>
          </div>
        ) : (
          <div className="overflow-hidden rounded-md border border-border/60 bg-muted/10">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="px-5 py-4">Curs</TableHead>
                  <TableHead className="px-5 py-4 text-center">Înscriere</TableHead>
                  <TableHead className="px-5 py-4 text-right">Max</TableHead>
                  <TableHead className="px-5 py-4 text-right">Actiune</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {availableTotalFiltered === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="py-10 text-center text-sm text-muted-foreground">
                      Nu exista cursuri disponibile pentru inscriere.
                    </TableCell>
                  </TableRow>
                ) : (
                  availablePaged.map((c) => {
                    const canEnroll = true;
                    return (
                      <TableRow key={c.id} className="hover:bg-muted/20">
                        <TableCell className="min-w-[260px] px-5 py-4">
                          <div className="space-y-1">
                            <Link href={`/cursuri/${c.id}`} className="text-sm font-medium underline-offset-4 hover:underline">
                              {c.title}
                            </Link>
                            {c.description ? <div className="text-xs text-muted-foreground">{c.description}</div> : null}
                          </div>
                        </TableCell>
                        <TableCell className="px-5 py-4 text-center">
                          <Badge variant="outline">deschisa</Badge>
                        </TableCell>
                        <TableCell className="px-5 py-4 text-right text-xs text-muted-foreground tabular-nums">{c.max_students}</TableCell>
                        <TableCell className="px-5 py-4 text-right">
                          <Button size="sm" onClick={() => enrollMutation.mutate(c.id)} disabled={!canEnroll || enrollMutation.isPending}>
                            Inroleaza-ma
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

