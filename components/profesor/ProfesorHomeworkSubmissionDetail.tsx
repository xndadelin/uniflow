"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/utils/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type SubmissionRow = {
  id: number;
  assignment_id: number;
  course_id: number;
  student_id: string;
  link_url: string | null;
  created_at: string;
  app_users?: { full_name: string | null; email: string } | Array<{ full_name: string | null; email: string }> | null;
};

type SubmissionFileRow = {
  id: number;
  submission_id: number;
  title: string | null;
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

function tryGetStorageObjectPathFromUrl(url: string) {
  try {
    const u = new URL(url);
    const s = u.pathname;
    const markers = [
      "/storage/v1/object/public/course-materials/",
      "/storage/v1/object/sign/course-materials/",
      "/storage/v1/object/course-materials/",
    ];
    for (const m of markers) {
      const idx = s.indexOf(m);
      if (idx >= 0) return decodeURIComponent(s.slice(idx + m.length));
    }
  } catch {
    // ignore
  }
  return null;
}

export function ProfesorHomeworkSubmissionDetail({
  courseId,
  assignmentId,
  submissionId,
}: {
  courseId: number;
  assignmentId: number;
  submissionId: number;
}) {
  const supabase = useMemo(() => createClient(), []);

  const submissionQuery = useQuery({
    queryKey: ["profesor-submission-detail", { submissionId }],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("course_homework_submissions_v2")
        .select("id,assignment_id,course_id,student_id,link_url,created_at,app_users(full_name,email)")
        .eq("id", submissionId)
        .single();
      if (error) throw error;
      return data as SubmissionRow;
    },
  });

  const filesQuery = useQuery({
    queryKey: ["profesor-submission-files", { submissionId }],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("course_homework_submission_files")
        .select("id,submission_id,title,url,created_at")
        .eq("submission_id", submissionId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as SubmissionFileRow[];
    },
  });

  async function openMaybeSigned(url: string) {
    const objectPath = tryGetStorageObjectPathFromUrl(url);
    if (!objectPath) {
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }
    const { data, error } = await supabase.storage.from("course-materials").createSignedUrl(objectPath, 60 * 10);
    if (error || !data?.signedUrl) {
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  const s = submissionQuery.data;
  const u = s?.app_users ? (Array.isArray(s.app_users) ? s.app_users[0] : s.app_users) : null;
  const studentName = u?.full_name?.trim() || null;
  const studentEmail = u?.email?.trim() || null;
  const studentLabel = studentName || studentEmail || s?.student_id || "Student";
  const files = filesQuery.data ?? [];
  const firstPdf = files.find((f) => isPdfUrl(f.url))?.url ?? null;

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-4 py-10 md:px-6 md:py-12">
      <header className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">Profesor</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">Submisie</h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Tema <span className="font-mono">#{assignmentId}</span> · Student: <span className="font-mono">{studentLabel}</span>
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href={`/profesor/cursuri/${courseId}`}>Inapoi la curs</Link>
        </Button>
      </header>

      {submissionQuery.isLoading || filesQuery.isLoading ? (
        <div className="text-sm text-muted-foreground">Se incarca...</div>
      ) : submissionQuery.isError ? (
        <div className="rounded-md bg-destructive/5 p-4 text-sm text-destructive">
          Eroare: <span className="font-mono text-xs">{getErrorMessage(submissionQuery.error)}</span>
        </div>
      ) : filesQuery.isError ? (
        <div className="rounded-md bg-destructive/5 p-4 text-sm text-destructive">
          Eroare: <span className="font-mono text-xs">{getErrorMessage(filesQuery.error)}</span>
        </div>
      ) : !s ? (
        <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">Submisie inexistenta.</div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[360px_1fr] lg:items-start">
          <Card className="lg:sticky lg:top-20">
            <CardHeader className="space-y-1">
              <CardTitle className="text-base font-semibold tracking-tight">Detalii</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <div className="text-xs text-muted-foreground">Trimis la</div>
                <div className="mt-1 text-sm">{new Date(s.created_at).toLocaleString()}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Student</div>
                <div className="mt-1 text-sm">
                  <div className="font-medium text-foreground">{studentName ?? "Student"}</div>
                  {studentEmail ? <div className="text-xs text-muted-foreground">{studentEmail}</div> : null}
                </div>
              </div>
              {s.link_url ? (
                <div className="pt-1">
                  <Button type="button" className="w-full" variant="outline" onClick={() => openMaybeSigned(s.link_url as string)}>
                    Deschide link
                  </Button>
                </div>
              ) : null}
              {files.length ? (
                <div className="pt-1">
                  <div className="text-xs text-muted-foreground">Fișiere</div>
                  <div className="mt-2 space-y-2">
                    {files.map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        className="block w-full truncate text-left text-sm underline underline-offset-4"
                        title={f.title ?? f.url}
                        onClick={() => openMaybeSigned(f.url)}
                      >
                        {f.title ?? f.url}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="space-y-1">
              <CardTitle className="text-base font-semibold tracking-tight">Preview</CardTitle>
              <p className="text-xs text-muted-foreground">Preview inline doar pentru PDF (primul PDF găsit).</p>
            </CardHeader>
            <CardContent>
              {firstPdf ? (
                <div className="overflow-hidden rounded-md border border-border/60 bg-muted/10">
                  <iframe title="submission-preview" src={firstPdf} className="h-[85vh] w-full md:h-[90vh]" />
                </div>
              ) : (
                <div className="rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground">Nu exista PDF pentru preview.</div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </main>
  );
}

