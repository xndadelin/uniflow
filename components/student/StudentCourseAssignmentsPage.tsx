"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/utils/supabase/client";
import { Pagination } from "@/components/Pagination";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type Course = {
  id: number;
  title: string;
  description: string | null;
};

type AssignmentRow = {
  id: number;
  course_id: number;
  title: string;
  description: string | null;
  due_at: string | null;
  created_at: string;
};

type SubmissionRow = {
  id: number;
  assignment_id: number;
  course_id: number;
  student_id: string;
  link_url: string | null;
  created_at: string;
};

function getErrorMessage(err: unknown) {
  if (!err) return "Eroare necunoscuta.";
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && "message" in err && typeof (err as { message?: unknown }).message === "string") {
    return (err as { message: string }).message;
  }
  return "Eroare la request.";
}

export function StudentCourseAssignmentsPage({ courseId }: { courseId: number }) {
  const supabase = useMemo(() => createClient(), []);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const courseQuery = useQuery({
    queryKey: ["course-meta", courseId],
    queryFn: async () => {
      const { data, error } = await supabase.from("courses").select("id,title,description").eq("id", courseId).single();
      if (error) throw error;
      return data as Course;
    },
  });

  const assignmentsQuery = useQuery({
    queryKey: ["course-assignments", courseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("course_homework_assignments")
        .select("id,course_id,title,description,due_at,created_at")
        .eq("course_id", courseId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as AssignmentRow[];
    },
  });

  const mySubmissionsQuery = useQuery({
    queryKey: ["course-my-submissions-v2", courseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("course_homework_submissions_v2")
        .select("id,assignment_id,course_id,student_id,link_url,created_at")
        .eq("course_id", courseId);
      if (error) throw error;
      return (data ?? []) as SubmissionRow[];
    },
  });

  const submittedSet = useMemo(() => {
    const set = new Set<number>();
    for (const s of mySubmissionsQuery.data ?? []) set.add(s.assignment_id);
    return set;
  }, [mySubmissionsQuery.data]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const all = assignmentsQuery.data ?? [];
    if (!q) return all;
    return all.filter((a) => `${a.title ?? ""} ${a.description ?? ""}`.toLowerCase().includes(q));
  }, [assignmentsQuery.data, search]);

  const total = filtered.length;
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-4 py-10 md:px-6 md:py-12">
      <header className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">Student</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
            Teme{courseQuery.data?.title ? ` · ${courseQuery.data.title}` : ""}
          </h1>
          {courseQuery.data?.description ? <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{courseQuery.data.description}</p> : null}
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href={`/cursuri/${courseId}`}>Inapoi la curs</Link>
        </Button>
      </header>

      <Card>
        <CardHeader className="space-y-1">
          <CardTitle className="text-base font-semibold tracking-tight">Lista teme</CardTitle>
          <p className="text-xs text-muted-foreground">Selectează o temă ca să vezi cerința și să faci upload.</p>
        </CardHeader>
        <CardContent>
          {assignmentsQuery.isLoading ? (
            <div className="text-sm text-muted-foreground">Se incarca...</div>
          ) : assignmentsQuery.isError ? (
            <div className="text-sm text-destructive">Eroare: {getErrorMessage(assignmentsQuery.error)}</div>
          ) : total === 0 ? (
            <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">Nu exista teme inca.</div>
          ) : (
            <>
              <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                <div className="space-y-1">
                  <Label htmlFor="a-search">Cauta</Label>
                  <Input
                    id="a-search"
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setPage(1);
                    }}
                    placeholder="Titlu / descriere..."
                  />
                </div>
                <div className="sm:pb-[2px]">
                  <Pagination variant="compact" page={page} pageSize={pageSize} totalItems={total} onPageChange={setPage} />
                </div>
              </div>

              <div className="overflow-hidden rounded-md border border-border/60 bg-muted/15 divide-y divide-border/30">
                {paged.map((a) => {
                  const submitted = submittedSet.has(a.id);
                  return (
                    <Link key={a.id} href={`/cursuri/${courseId}/teme/${a.id}`} className="block px-4 py-3 transition hover:bg-muted/25">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-foreground">{a.title}</div>
                          {a.description ? <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">{a.description}</div> : null}
                          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                            <span>{new Date(a.created_at).toLocaleString()}</span>
                            {a.due_at ? <span>· deadline: {new Date(a.due_at).toLocaleString()}</span> : null}
                          </div>
                        </div>
                        <div className="shrink-0 flex items-center gap-2">
                          {submitted ? <Badge variant="outline">trimisa</Badge> : <Badge variant="outline">netrimisa</Badge>}
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </main>
  );
}

