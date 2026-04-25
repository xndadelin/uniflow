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

type Course = {
  id: number;
  title: string;
  description: string | null;
};

type MaterialRow = {
  id: number;
  course_id: number;
  title: string;
  description: string | null;
  url: string;
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

export function StudentCourseMaterialsPage({ courseId }: { courseId: number }) {
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

  const materialsQuery = useQuery({
    queryKey: ["course-materials", courseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("course_materials")
        .select("id,course_id,title,description,url,created_at")
        .eq("course_id", courseId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as MaterialRow[];
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const all = materialsQuery.data ?? [];
    if (!q) return all;
    return all.filter((m) => `${m.title ?? ""} ${m.description ?? ""}`.toLowerCase().includes(q));
  }, [materialsQuery.data, search]);

  const total = filtered.length;
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-4 py-10 md:px-6 md:py-12">
      <header className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">Student</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
            Materiale{courseQuery.data?.title ? ` · ${courseQuery.data.title}` : ""}
          </h1>
          {courseQuery.data?.description ? <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{courseQuery.data.description}</p> : null}
        </div>
        <div className="flex gap-3">
          <Button asChild variant="outline" size="sm">
            <Link href={`/cursuri/${courseId}`}>Inapoi la curs</Link>
          </Button>
        </div>
      </header>

      <Card>
        <CardHeader className="space-y-1">
          <CardTitle className="text-base font-semibold tracking-tight">Lista materiale</CardTitle>
          <p className="text-xs text-muted-foreground">Click pe un material pentru preview + download.</p>
        </CardHeader>
        <CardContent>
          {materialsQuery.isLoading ? (
            <div className="text-sm text-muted-foreground">Se incarca...</div>
          ) : materialsQuery.isError ? (
            <div className="text-sm text-destructive">Eroare: {getErrorMessage(materialsQuery.error)}</div>
          ) : total === 0 ? (
            <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">Nu exista materiale.</div>
          ) : (
            <>
              <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                <div className="space-y-1">
                  <Label htmlFor="m-search">Cauta</Label>
                  <Input
                    id="m-search"
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
                {paged.map((m) => (
                  <Link
                    key={m.id}
                    href={`/cursuri/${courseId}/materiale/${m.id}`}
                    className="block px-4 py-3 transition hover:bg-muted/25"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-foreground">{m.title}</div>
                        {m.description ? <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">{m.description}</div> : null}
                        <div className="mt-2 text-[11px] text-muted-foreground">{new Date(m.created_at).toLocaleString()}</div>
                      </div>
                      <div className="shrink-0 text-xs text-muted-foreground">Preview</div>
                    </div>
                  </Link>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </main>
  );
}

