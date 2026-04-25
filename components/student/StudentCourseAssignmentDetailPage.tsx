"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { createClient } from "@/utils/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type AssignmentRow = {
  id: number;
  course_id: number;
  title: string;
  description: string | null;
  due_at: string | null;
  created_at: string;
};

type AssignmentFileRow = {
  id: number;
  assignment_id: number;
  title: string | null;
  url: string;
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
  try {
    return JSON.stringify(err);
  } catch {
    // ignore
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

export function StudentCourseAssignmentDetailPage({ courseId, assignmentId }: { courseId: number; assignmentId: number }) {
  const supabase = useMemo(() => createClient(), []);
  const [linkUrl, setLinkUrl] = useState("");
  const [files, setFiles] = useState<File[]>([]);

  const assignmentQuery = useQuery({
    queryKey: ["course-assignment", { courseId, assignmentId }],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("course_homework_assignments")
        .select("id,course_id,title,description,due_at,created_at")
        .eq("course_id", courseId)
        .eq("id", assignmentId)
        .single();
      if (error) throw error;
      return data as AssignmentRow;
    },
  });

  const assignmentFilesQuery = useQuery({
    queryKey: ["course-assignment-files", { assignmentId }],
    enabled: assignmentQuery.isSuccess,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("course_homework_assignment_files")
        .select("id,assignment_id,title,url,created_at")
        .eq("assignment_id", assignmentId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as AssignmentFileRow[];
    },
  });

  const mySubmissionQuery = useQuery({
    queryKey: ["course-my-submission", { assignmentId }],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("course_homework_submissions_v2")
        .select("id,assignment_id,course_id,student_id,link_url,created_at")
        .eq("assignment_id", assignmentId)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as SubmissionRow | null;
    },
  });

  const submissionFilesQuery = useQuery({
    queryKey: ["course-my-submission-files", { assignmentId }],
    enabled: Boolean(mySubmissionQuery.data?.id),
    queryFn: async () => {
      const submissionId = mySubmissionQuery.data?.id;
      if (!submissionId) return [] as SubmissionFileRow[];
      const { data, error } = await supabase
        .from("course_homework_submission_files")
        .select("id,submission_id,title,url,created_at")
        .eq("submission_id", submissionId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as SubmissionFileRow[];
    },
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      const cleanedLink = linkUrl.trim() || null;
      const hasFiles = files.length > 0;
      if (!cleanedLink && !hasFiles) throw new Error("Trebuie sa pui un link sau sa incarci cel putin un fisier.");

      const { error: rpcErr } = await supabase.rpc("submit_homework_assignment", {
        _assignment_id: assignmentId,
        _link_url: cleanedLink,
      });
      if (rpcErr) throw rpcErr;

      // Refresh submission to get id (create/update)
      const { data: sub, error: subErr } = await supabase
        .from("course_homework_submissions_v2")
        .select("id,assignment_id,course_id,student_id,link_url,created_at")
        .eq("assignment_id", assignmentId)
        .maybeSingle();
      if (subErr) throw subErr;
      if (!sub) throw new Error("Nu s-a putut crea submissia.");

      if (files.length) {
        const rows: Array<{ submission_id: number; title: string | null; url: string }> = [];
        for (const f of files) {
          const safeName = f.name.replace(/[^a-zA-Z0-9._-]/g, "_");
          const path = `homework/course-${courseId}/assignment-${assignmentId}/student-${sub.student_id}/${Date.now()}-${safeName}`;
          const uploadRes = await supabase.storage.from("course-materials").upload(path, f, { upsert: false, contentType: f.type });
          if (uploadRes.error) {
            const msg = String(uploadRes.error.message ?? "Upload esuat.");
            throw new Error(`Upload esuat pentru "${f.name}": ${msg}`);
          }
          const publicUrl = supabase.storage.from("course-materials").getPublicUrl(path).data.publicUrl;
          rows.push({ submission_id: sub.id, title: f.name, url: publicUrl });
        }
        const { error: insErr } = await supabase.from("course_homework_submission_files").insert(rows);
        if (insErr) throw insErr;
      }
    },
    onSuccess: async () => {
      toast.success("Tema trimisa.");
      setFiles([]);
      await Promise.all([mySubmissionQuery.refetch(), submissionFilesQuery.refetch()]);
    },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });

  const a = assignmentQuery.data;
  const canPreviewAssignmentPdf = Boolean(assignmentFilesQuery.data?.[0]?.url) && isPdfUrl(assignmentFilesQuery.data?.[0]?.url ?? "");

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-4 py-10 md:px-6 md:py-12">
      <header className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">Student</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">{a?.title ?? "Tema"}</h1>
          {a?.description ? <p className="mt-2 max-w-3xl text-sm text-muted-foreground">{a.description}</p> : null}
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href={`/cursuri/${courseId}/teme`}>Inapoi la teme</Link>
        </Button>
      </header>

      {assignmentQuery.isLoading ? (
        <div className="text-sm text-muted-foreground">Se incarca...</div>
      ) : assignmentQuery.isError ? (
        <div className="rounded-md bg-destructive/5 p-4 text-sm text-destructive">
          Eroare: <span className="font-mono text-xs">{getErrorMessage(assignmentQuery.error)}</span>
        </div>
      ) : !a ? (
        <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">Tema inexistenta.</div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[420px_1fr] lg:items-start">
          <Card className="lg:sticky lg:top-20">
            <CardHeader className="space-y-1">
              <CardTitle className="text-base font-semibold tracking-tight">Submit</CardTitle>
              <p className="text-xs text-muted-foreground">
                {a.due_at ? `Deadline: ${new Date(a.due_at).toLocaleString()}` : "Fara deadline"}
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="hw-link">Link (optional)</Label>
                <Input id="hw-link" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://..." />
              </div>
              <div className="space-y-1">
                <Label>Fișiere (optional)</Label>
                <input
                  type="file"
                  multiple
                  onChange={(e) => {
                    const list = Array.from(e.target.files ?? []).filter((f) => f && f.size > 0);
                    setFiles(list);
                    e.currentTarget.value = "";
                  }}
                  className="w-full rounded-md border border-input/60 bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-ring"
                />
              </div>
              <div className="flex justify-end">
                <Button onClick={() => submitMutation.mutate()} disabled={submitMutation.isPending}>
                  Trimite
                </Button>
              </div>

              {mySubmissionQuery.data ? (
                <div className="rounded-md border border-border/60 bg-muted/10 p-3 text-sm">
                  <div className="text-xs text-muted-foreground">Ultima trimitere</div>
                  <div className="mt-1 text-sm">{new Date(mySubmissionQuery.data.created_at).toLocaleString()}</div>
                  {mySubmissionQuery.data.link_url ? (
                    <div className="mt-2">
                      <a className="text-sm underline underline-offset-4" href={mySubmissionQuery.data.link_url} target="_blank" rel="noreferrer">
                        Link
                      </a>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {submissionFilesQuery.data?.length ? (
                <div className="rounded-md border border-border/60 bg-muted/10 p-3">
                  <div className="text-xs text-muted-foreground">Fișiere trimise</div>
                  <div className="mt-2 space-y-2">
                    {submissionFilesQuery.data.slice(0, 10).map((f) => (
                      <a key={f.id} href={f.url} target="_blank" rel="noreferrer" className="block truncate text-sm underline underline-offset-4">
                        {f.title ?? f.url}
                      </a>
                    ))}
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card>
              <CardHeader className="space-y-1">
                <CardTitle className="text-base font-semibold tracking-tight">Fișiere profesor</CardTitle>
              </CardHeader>
              <CardContent>
                {assignmentFilesQuery.isLoading ? (
                  <div className="text-sm text-muted-foreground">Se incarca...</div>
                ) : assignmentFilesQuery.isError ? (
                  <div className="text-sm text-destructive">Eroare: {getErrorMessage(assignmentFilesQuery.error)}</div>
                ) : (assignmentFilesQuery.data ?? []).length === 0 ? (
                  <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">Nu exista fisiere atasate.</div>
                ) : (
                  <div className="space-y-2">
                    {(assignmentFilesQuery.data ?? []).map((f) => (
                      <a key={f.id} href={f.url} target="_blank" rel="noreferrer" className="block truncate text-sm underline underline-offset-4">
                        {f.title ?? f.url}
                      </a>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="space-y-1">
                <CardTitle className="text-base font-semibold tracking-tight">Preview</CardTitle>
                <p className="text-xs text-muted-foreground">Preview inline doar pentru PDF (primul fișier).</p>
              </CardHeader>
              <CardContent>
                {canPreviewAssignmentPdf ? (
                  <div className="overflow-hidden rounded-md border border-border/60 bg-muted/10">
                    <iframe title="assignment-preview" src={assignmentFilesQuery.data?.[0]?.url ?? ""} className="h-[80vh] w-full md:h-[88vh]" />
                  </div>
                ) : (
                  <div className="rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground">Nu exista preview PDF disponibil.</div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </main>
  );
}

