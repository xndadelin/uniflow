"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/utils/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

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

function isPdfUrl(url: string) {
  try {
    const u = new URL(url);
    return u.pathname.toLowerCase().endsWith(".pdf");
  } catch {
    return url.toLowerCase().includes(".pdf");
  }
}

function DetailSkeleton({ courseId }: { courseId: number }) {
  return (
    <div className="grid gap-6 lg:grid-cols-[360px_1fr] lg:items-start">
      <Card className="lg:sticky lg:top-20">
        <CardHeader className="space-y-2">
          <div className="h-4 w-20 animate-pulse rounded bg-muted/40" />
          <div className="h-3 w-48 animate-pulse rounded bg-muted/25" />
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="space-y-2">
            <div className="h-3 w-16 animate-pulse rounded bg-muted/25" />
            <div className="h-4 w-24 animate-pulse rounded bg-muted/40" />
          </div>
          <div className="space-y-2">
            <div className="h-3 w-16 animate-pulse rounded bg-muted/25" />
            <div className="h-4 w-40 animate-pulse rounded bg-muted/40" />
          </div>
          <div className="h-9 w-full animate-pulse rounded-md bg-muted/35" />
          <div className="text-[11px] text-muted-foreground">Curs #{courseId}</div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="space-y-2">
          <div className="h-4 w-20 animate-pulse rounded bg-muted/40" />
          <div className="h-3 w-96 max-w-full animate-pulse rounded bg-muted/25" />
        </CardHeader>
        <CardContent>
          <div className="h-[70vh] w-full animate-pulse rounded-md bg-muted/25 md:h-[78vh]" />
        </CardContent>
      </Card>
    </div>
  );
}

export function StudentCourseMaterialDetailPage({ courseId, materialId }: { courseId: number; materialId: number }) {
  const supabase = useMemo(() => createClient(), []);

  const materialQuery = useQuery({
    queryKey: ["course-material", { courseId, materialId }],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("course_materials")
        .select("id,course_id,title,description,url,created_at")
        .eq("course_id", courseId)
        .eq("id", materialId)
        .single();
      if (error) throw error;
      return data as MaterialRow;
    },
  });

  const m = materialQuery.data;
  const canPreviewInline = Boolean(m?.url) && isPdfUrl(m?.url ?? "");

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-4 py-10 md:px-6 md:py-12">
      <header className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">Student</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">{m?.title ?? (materialQuery.isLoading ? "Se încarcă..." : "Material")}</h1>
          {materialQuery.isLoading ? <div className="mt-3 h-4 w-96 max-w-full animate-pulse rounded bg-muted/35" /> : null}
          {m?.description ? <p className="mt-2 max-w-3xl text-sm text-muted-foreground">{m.description}</p> : null}
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={`/cursuri/${courseId}/materiale`}>Inapoi la materiale</Link>
          </Button>
          {m?.url ? (
            <Button asChild size="sm" variant="outline">
              <a href={m.url} target="_blank" rel="noreferrer">
                Deschide in tab nou
              </a>
            </Button>
          ) : null}
        </div>
      </header>

      {materialQuery.isLoading ? (
        <DetailSkeleton courseId={courseId} />
      ) : materialQuery.isError ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-6 text-sm text-destructive">
          <div className="font-medium">Nu am putut încărca materialul.</div>
          <div className="mt-1 font-mono text-xs opacity-90">{getErrorMessage(materialQuery.error)}</div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => materialQuery.refetch()}>
              Reîncearcă
            </Button>
            <Button asChild size="sm" variant="ghost">
              <Link href={`/cursuri/${courseId}/materiale`}>Înapoi la listă</Link>
            </Button>
          </div>
        </div>
      ) : !m ? (
        <div className="rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground">
          Material inexistent sau nu ai acces la el.
          <div className="mt-4">
            <Button asChild size="sm" variant="outline">
              <Link href={`/cursuri/${courseId}/materiale`}>Înapoi la materiale</Link>
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[360px_1fr] lg:items-start">
          <Card className="lg:sticky lg:top-20">
            <CardHeader className="space-y-1">
              <CardTitle className="text-base font-semibold tracking-tight">Detalii</CardTitle>
              <p className="text-xs text-muted-foreground">Metadate + actiuni rapide.</p>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <div className="text-xs text-muted-foreground">Curs</div>
                <div className="mt-1 font-mono text-sm">#{courseId}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Creat la</div>
                <div className="mt-1 text-sm">{new Date(m.created_at).toLocaleString()}</div>
              </div>
              <div className="pt-2">
                <Button asChild className="w-full" variant="outline">
                  <a href={m.url} target="_blank" rel="noreferrer">
                    Download / Open
                  </a>
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="space-y-1">
              <CardTitle className="text-base font-semibold tracking-tight">Preview</CardTitle>
              <p className="text-xs text-muted-foreground">
                {canPreviewInline ? "PDF preview inline." : "Preview inline disponibil doar pentru PDF; pentru restul se deschide in tab nou."}
              </p>
            </CardHeader>
            <CardContent>
              {canPreviewInline ? (
                <div className="overflow-hidden rounded-md border border-border/60 bg-muted/10">
                  <iframe title={m.title} src={m.url} className="h-[80vh] w-full md:h-[88vh]" />
                </div>
              ) : (
                <div className="rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground">
                  Nu pot face preview inline pentru acest tip de link. Folosește butonul “Deschide in tab nou”.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </main>
  );
}

