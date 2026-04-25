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
  const pageSize = 10;

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
  const enrolledTotal = enrolledCourses.length;
  const availableTotal = availableCourses.length;
  const enrolledPaged = enrolledCourses.slice((enrolledPage - 1) * pageSize, enrolledPage * pageSize);
  const availablePaged = availableCourses.slice((availablePage - 1) * pageSize, availablePage * pageSize);

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-4 py-10 md:px-6 md:py-12">
      <header className="mb-8">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">Student</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">Cursuri</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Vezi cursurile disponibile și înrolează-te la cele care permit înscriere.
        </p>
      </header>

      <div className="grid gap-8 lg:grid-cols-2 lg:items-start">
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold tracking-tight">Cursurile mele</CardTitle>
          </CardHeader>
          <CardContent>
        {enrollmentsQuery.isLoading || coursesQuery.isLoading ? (
          <div className="text-sm text-muted-foreground">Se incarca...</div>
        ) : enrolledTotal === 0 ? (
          <div className="text-sm text-muted-foreground">Nu esti inrolat la niciun curs inca.</div>
        ) : (
          <div>
            <div className="mb-4">
              <Pagination
                variant="compact"
                page={enrolledPage}
                pageSize={pageSize}
                totalItems={enrolledTotal}
                onPageChange={setEnrolledPage}
              />
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Curs</TableHead>
                  <TableHead className="text-right">Max studenti</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {enrolledPaged.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="min-w-[260px]">
                      <div className="space-y-1">
                        <Link href={`/cursuri/${c.id}`} className="text-sm font-medium underline-offset-4 hover:underline">
                          {c.title}
                        </Link>
                        {c.description ? <div className="text-xs text-muted-foreground">{c.description}</div> : null}
                      </div>
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground tabular-nums">{c.max_students}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold tracking-tight">Cursuri disponibile</CardTitle>
            <p className="text-xs text-muted-foreground">Cursuri cu inscriere deschisa, la care nu esti inrolat inca.</p>
          </CardHeader>
          <CardContent>

        {coursesQuery.isLoading ? (
          <div className="text-sm text-muted-foreground">Se incarca...</div>
        ) : coursesQuery.isError ? (
          <div className="rounded-md bg-destructive/5 p-4 text-sm text-destructive">
            Eroare la incarcarea cursurilor: <span className="font-mono text-xs">{getErrorMessage(coursesQuery.error)}</span>
          </div>
        ) : (
          <div>
            <div className="mb-4">
              <Pagination
                variant="compact"
                page={availablePage}
                pageSize={pageSize}
                totalItems={availableTotal}
                onPageChange={setAvailablePage}
              />
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Curs</TableHead>
                  <TableHead className="text-center">Inscriere</TableHead>
                  <TableHead className="text-right">Max studenti</TableHead>
                  <TableHead className="text-right">Actiune</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {availableTotal === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="py-10 text-center text-sm text-muted-foreground">
                      Nu exista cursuri disponibile pentru inscriere.
                    </TableCell>
                  </TableRow>
                ) : (
                  availablePaged.map((c) => {
                    const canEnroll = true;
                    return (
                      <TableRow key={c.id}>
                        <TableCell className="min-w-[260px]">
                          <div className="space-y-1">
                            <Link href={`/cursuri/${c.id}`} className="text-sm font-medium underline-offset-4 hover:underline">
                              {c.title}
                            </Link>
                            {c.description ? <div className="text-xs text-muted-foreground">{c.description}</div> : null}
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline">deschisa</Badge>
                        </TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground tabular-nums">{c.max_students}</TableCell>
                        <TableCell className="text-right">
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

