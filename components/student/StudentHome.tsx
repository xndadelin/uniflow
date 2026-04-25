"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { createClient } from "@/utils/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

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

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-10">
      <header className="mb-6">
        <p className="font-mono text-xs uppercase tracking-[0.24em] text-primary">Student</p>
        <h1 className="mt-2 font-mono text-2xl font-semibold tracking-wider text-foreground">Cursuri</h1>
        <p className="mt-1 text-sm text-muted-foreground">Vezi cursurile disponibile si inroleaza-te la cele care permit inscriere.</p>
      </header>

      <section className="rounded-lg border border-border bg-card p-4 md:p-6">
        <h2 className="font-mono text-sm font-semibold text-foreground">Cursurile mele</h2>
        {enrollmentsQuery.isLoading || coursesQuery.isLoading ? (
          <div className="mt-4 rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">Se incarca...</div>
        ) : enrolledCourses.length === 0 ? (
          <div className="mt-4 rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
            Nu esti inrolat la niciun curs inca.
          </div>
        ) : (
          <div className="mt-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Curs</TableHead>
                  <TableHead className="text-right">Max studenti</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {enrolledCourses.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="min-w-[260px]">
                      <div className="space-y-0.5">
                          <Link href={`/cursuri/${c.id}`} className="text-sm font-medium text-foreground underline-offset-4 hover:underline">
                            {c.title}
                          </Link>
                        {c.description ? <div className="text-xs text-muted-foreground">{c.description}</div> : null}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs text-muted-foreground">{c.max_students}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <section className="mt-6 rounded-lg border border-border bg-card p-4 md:p-6">
        <div className="flex flex-col gap-1">
          <h2 className="font-mono text-sm font-semibold text-foreground">Cursuri disponibile</h2>
          <p className="text-xs text-muted-foreground">Cursuri cu inscriere deschisa, la care nu esti inrolat inca.</p>
        </div>

        {coursesQuery.isLoading ? (
          <div className="mt-4 rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">Se incarca...</div>
        ) : coursesQuery.isError ? (
          <div className="mt-4 rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
            Eroare la incarcarea cursurilor: <span className="font-mono text-xs">{getErrorMessage(coursesQuery.error)}</span>
          </div>
        ) : (
          <div className="mt-4">
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
                {availableCourses.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="py-10 text-center text-sm text-muted-foreground">
                      Nu exista cursuri disponibile pentru inscriere.
                    </TableCell>
                  </TableRow>
                ) : (
                  availableCourses.map((c) => {
                    const canEnroll = true;
                    return (
                      <TableRow key={c.id}>
                        <TableCell className="min-w-[260px]">
                          <div className="space-y-0.5">
                            <Link href={`/cursuri/${c.id}`} className="text-sm font-medium text-foreground underline-offset-4 hover:underline">
                              {c.title}
                            </Link>
                            {c.description ? <div className="text-xs text-muted-foreground">{c.description}</div> : null}
                          </div>
                        </TableCell>
                        <TableCell className="text-center text-xs text-muted-foreground">
                          Deschisa
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs text-muted-foreground">{c.max_students}</TableCell>
                        <TableCell className="text-right">
                          <button
                            type="button"
                            disabled={!canEnroll || enrollMutation.isPending}
                            onClick={() => enrollMutation.mutate(c.id)}
                            className="inline-flex items-center justify-center bg-primary px-3 py-2 text-xs font-semibold uppercase tracking-wide text-primary-foreground disabled:opacity-50"
                          >
                            Inroleaza-ma
                          </button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </main>
  );
}

