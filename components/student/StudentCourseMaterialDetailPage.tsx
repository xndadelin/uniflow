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
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">{m?.title ?? "Material"}</h1>
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
        <div className="text-sm text-muted-foreground">Se incarca...</div>
      ) : materialQuery.isError ? (
        <div className="rounded-md bg-destructive/5 p-4 text-sm text-destructive">
          Eroare: <span className="font-mono text-xs">{getErrorMessage(materialQuery.error)}</span>
        </div>
      ) : !m ? (
        <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">Material inexistent.</div>
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

