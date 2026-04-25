"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { createClient } from "@/utils/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Pagination } from "@/components/Pagination";
import { Textarea } from "@/components/ui/textarea";

type Course = {
  id: number;
  teacher_id: string;
  title: string;
  description: string | null;
  max_students: number;
  created_at: string;
};

type CourseMaterialRow = {
  id: number;
  course_id: number;
  title: string;
  description: string | null;
  url: string;
  created_at: string;
};

type ResourceRequestRow = {
  id: number;
  course_id: number;
  student_id: string;
  resource_type: "tokens" | "vps_subscription";
  requested_amount: number;
  status: "pending" | "approved" | "rejected" | "escalated";
  created_at: string;
};

type CourseAllocationRow = {
  course_id: number;
  resource_type: "tokens" | "vps_subscription";
  professor_bonus_remaining: number;
  professor_bonus_amount: number;
};

type HomeworkAssignmentRow = {
  id: number;
  course_id: number;
  title: string;
  description: string | null;
  due_at: string | null;
  created_at: string;
};

type HomeworkAssignmentFileRow = {
  id: number;
  assignment_id: number;
  title: string | null;
  url: string;
  created_at: string;
};

type HomeworkSubmissionRow = {
  id: number;
  assignment_id: number;
  course_id: number;
  student_id: string;
  link_url: string | null;
  created_at: string;
  app_users?: { full_name: string | null; email: string } | Array<{ full_name: string | null; email: string }> | null;
};

type HomeworkSubmissionFileRow = {
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

function mergeFiles(prev: File[], next: File[]) {
  const key = (f: File) => `${f.name}__${f.size}__${f.lastModified}`;
  const seen = new Set(prev.map(key));
  const merged = [...prev];
  for (const f of next) {
    const k = key(f);
    if (!seen.has(k)) {
      seen.add(k);
      merged.push(f);
    }
  }
  return merged;
}

export function ProfesorCourseManageClient({ courseId }: { courseId: number }) {
  const supabase = useMemo(() => createClient(), []);

  const [materialTitle, setMaterialTitle] = useState("");
  const [materialUrl, setMaterialUrl] = useState("");
  const [materialDescription, setMaterialDescription] = useState("");
  const [materialFiles, setMaterialFiles] = useState<File[]>([]);
  const [view, setView] = useState<"materials" | "homework" | "requests">("materials");
  const [materialsSearch, setMaterialsSearch] = useState<string>("");
  const [materialsPage, setMaterialsPage] = useState<number>(1);
  const [requestsPage, setRequestsPage] = useState<number>(1);
  const pageSize = 10;

  const [assignmentTitle, setAssignmentTitle] = useState("");
  const [assignmentDescription, setAssignmentDescription] = useState("");
  const [assignmentDueAt, setAssignmentDueAt] = useState<string>("");
  const [assignmentFiles, setAssignmentFiles] = useState<File[]>([]);
  const [assignmentsSearch, setAssignmentsSearch] = useState<string>("");
  const [assignmentsPage, setAssignmentsPage] = useState<number>(1);
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<number | null>(null);

  const profesorCheckQuery = useQuery({
    queryKey: ["profesor-check"],
    queryFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return { isProfesor: false, isAuthenticated: false, userId: null as string | null };

      const { data, error } = await supabase.rpc("is_profesor", { _user_id: user.id });
      if (error) throw error;
      return { isProfesor: Boolean(data), isAuthenticated: true, userId: user.id };
    },
  });

  const courseQuery = useQuery({
    queryKey: ["profesor-course", { courseId }],
    enabled: profesorCheckQuery.data?.isProfesor === true && Number.isFinite(courseId) && courseId > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("courses")
        .select("id,teacher_id,title,description,max_students,created_at")
        .eq("id", courseId)
        .single();
      if (error) throw error;
      return data as Course;
    },
  });

  const materialsQuery = useQuery({
    queryKey: ["profesor-course-materials", { courseId }],
    enabled: profesorCheckQuery.data?.isProfesor === true && Number.isFinite(courseId) && courseId > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("course_materials")
        .select("id,course_id,title,description,url,created_at")
        .eq("course_id", courseId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as CourseMaterialRow[];
    },
  });

  const requestsQuery = useQuery({
    queryKey: ["profesor-course-requests", { courseId }],
    enabled: profesorCheckQuery.data?.isProfesor === true && Number.isFinite(courseId) && courseId > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("course_resource_requests")
        .select("id,course_id,student_id,resource_type,requested_amount,status,created_at")
        .eq("course_id", courseId)
        .in("status", ["pending", "escalated"])
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ResourceRequestRow[];
    },
  });

  const allocationsQuery = useQuery({
    queryKey: ["profesor-course-allocations", { courseId }],
    enabled: profesorCheckQuery.data?.isProfesor === true && Number.isFinite(courseId) && courseId > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("course_resource_allocations")
        .select("course_id,resource_type,professor_bonus_remaining,professor_bonus_amount")
        .eq("course_id", courseId);
      if (error) throw error;
      return (data ?? []) as CourseAllocationRow[];
    },
  });

  const assignmentsQuery = useQuery({
    queryKey: ["profesor-course-assignments", { courseId }],
    enabled: profesorCheckQuery.data?.isProfesor === true && Number.isFinite(courseId) && courseId > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("course_homework_assignments")
        .select("id,course_id,title,description,due_at,created_at")
        .eq("course_id", courseId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as HomeworkAssignmentRow[];
    },
  });

  const assignmentFilesQuery = useQuery({
    queryKey: ["profesor-course-assignment-files", { courseId }],
    enabled: profesorCheckQuery.data?.isProfesor === true && Number.isFinite(courseId) && courseId > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("course_homework_assignment_files")
        .select("id,assignment_id,title,url,created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as HomeworkAssignmentFileRow[];
    },
  });

  const submissionsQuery = useQuery({
    queryKey: ["profesor-course-submissions-v2", { courseId, assignmentId: selectedAssignmentId }],
    enabled:
      profesorCheckQuery.data?.isProfesor === true &&
      Number.isFinite(courseId) &&
      courseId > 0 &&
      typeof selectedAssignmentId === "number" &&
      selectedAssignmentId > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("course_homework_submissions_v2")
        .select("id,assignment_id,course_id,student_id,link_url,created_at,app_users(full_name,email)")
        .eq("course_id", courseId)
        .eq("assignment_id", selectedAssignmentId as number)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as HomeworkSubmissionRow[];
    },
  });

  const submissionFilesQuery = useQuery({
    queryKey: ["profesor-course-submission-files", { courseId, assignmentId: selectedAssignmentId }],
    enabled: submissionsQuery.isSuccess && (submissionsQuery.data ?? []).length > 0,
    queryFn: async () => {
      const ids = (submissionsQuery.data ?? []).map((s) => s.id);
      if (ids.length === 0) return [] as HomeworkSubmissionFileRow[];
      const { data, error } = await supabase
        .from("course_homework_submission_files")
        .select("id,submission_id,title,url,created_at")
        .in("submission_id", ids)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as HomeworkSubmissionFileRow[];
    },
  });

  const addMaterialMutation = useMutation({
    mutationFn: async () => {
      const trimmedTitle = materialTitle.trim();
      const trimmedUrl = materialUrl.trim();
      const desc = materialDescription.trim() ? materialDescription.trim() : null;
      const hasFiles = materialFiles.length > 0;

      if (!hasFiles && !trimmedUrl) throw new Error("Trebuie sa incarci cel putin un fisier sau sa pui un URL.");

      const rowsToInsert: Array<{ course_id: number; teacher_id: string | null; title: string; description: string | null; url: string }> = [];

      if (hasFiles) {
        for (const file of materialFiles) {
          const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
          const path = `course-${courseId}/${Date.now()}-${safeName}`;
          const uploadRes = await supabase.storage.from("course-materials").upload(path, file, { upsert: false, contentType: file.type });
          if (uploadRes.error) {
            const raw = JSON.stringify(uploadRes.error);
            const msg = String(uploadRes.error.message ?? "Upload esuat.");
            throw new Error(`Upload esuat: ${msg}. Detalii: ${raw}`);
          }
          const publicUrl = supabase.storage.from("course-materials").getPublicUrl(path).data.publicUrl;
          rowsToInsert.push({
            course_id: courseId,
            teacher_id: profesorCheckQuery.data?.userId ?? null,
            title: trimmedTitle || file.name,
            description: desc,
            url: publicUrl,
          });
        }
      }

      if (trimmedUrl) {
        rowsToInsert.push({
          course_id: courseId,
          teacher_id: profesorCheckQuery.data?.userId ?? null,
          title: trimmedTitle || "Link",
          description: desc,
          url: trimmedUrl,
        });
      }

      const { error } = await supabase.from("course_materials").insert(rowsToInsert);
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Material(e) adaugat(e).");
      setMaterialTitle("");
      setMaterialUrl("");
      setMaterialDescription("");
      setMaterialFiles([]);
      await materialsQuery.refetch();
    },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });

  const approveRequestMutation = useMutation({
    mutationFn: async (requestId: number) => {
      const { error } = await supabase.rpc("approve_course_resource_request", { _request_id: requestId });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Cerere aprobata (din bonus profesor).");
      await requestsQuery.refetch();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Eroare."),
  });

  const rejectRequestMutation = useMutation({
    mutationFn: async (requestId: number) => {
      const { error } = await supabase.rpc("reject_course_resource_request", { _request_id: requestId });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Cerere respinsa.");
      await requestsQuery.refetch();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Eroare."),
  });

  const escalateRequestMutation = useMutation({
    mutationFn: async (requestId: number) => {
      const { error } = await supabase.rpc("escalate_course_resource_request", { _request_id: requestId });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Cerere trimisa la admin (escaladare).");
      await requestsQuery.refetch();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Eroare."),
  });

  const createAssignmentMutation = useMutation({
    mutationFn: async () => {
      const t = assignmentTitle.trim();
      if (!t) throw new Error("Titlu invalid.");

      const dueAtIso = assignmentDueAt ? new Date(assignmentDueAt).toISOString() : null;

      const { data: newId, error: rpcErr } = await supabase.rpc("create_homework_assignment", {
        _course_id: courseId,
        _title: t,
        _description: assignmentDescription.trim() || null,
        _due_at: dueAtIso,
      });
      if (rpcErr) throw rpcErr;

      const assignmentId = Number(newId);
      if (!Number.isFinite(assignmentId) || assignmentId <= 0) throw new Error("Nu s-a putut crea tema.");

      if (assignmentFiles.length) {
        const rows: Array<{ assignment_id: number; title: string | null; url: string }> = [];
        for (const file of assignmentFiles) {
          const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
          const path = `homework/course-${courseId}/assignment-${assignmentId}/teacher/${Date.now()}-${safeName}`;
          const uploadRes = await supabase.storage.from("course-materials").upload(path, file, { upsert: false, contentType: file.type });
          if (uploadRes.error) throw uploadRes.error;
          const publicUrl = supabase.storage.from("course-materials").getPublicUrl(path).data.publicUrl;
          rows.push({ assignment_id: assignmentId, title: file.name, url: publicUrl });
        }
        const { error: insErr } = await supabase.from("course_homework_assignment_files").insert(rows);
        if (insErr) throw insErr;
      }
    },
    onSuccess: async () => {
      toast.success("Tema creata.");
      setAssignmentTitle("");
      setAssignmentDescription("");
      setAssignmentDueAt("");
      setAssignmentFiles([]);
      await Promise.all([assignmentsQuery.refetch(), assignmentFilesQuery.refetch()]);
    },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });

  const course = courseQuery.data;
  const materials = materialsQuery.data ?? [];
  const requests = requestsQuery.data ?? [];
  const filteredMaterials = useMemo(() => {
    const q = materialsSearch.trim().toLowerCase();
    if (!q) return materials;
    return materials.filter((m) => {
      const hay = `${m.title ?? ""} ${m.description ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [materials, materialsSearch]);

  const materialsTotal = filteredMaterials.length;
  const materialsPaged = filteredMaterials.slice((materialsPage - 1) * pageSize, materialsPage * pageSize);

  const assignments = assignmentsQuery.data ?? [];
  const filteredAssignments = useMemo(() => {
    const q = assignmentsSearch.trim().toLowerCase();
    if (!q) return assignments;
    return assignments.filter((a) => `${a.title ?? ""} ${a.description ?? ""}`.toLowerCase().includes(q));
  }, [assignments, assignmentsSearch]);
  const assignmentsTotal = filteredAssignments.length;
  const assignmentsPaged = filteredAssignments.slice((assignmentsPage - 1) * pageSize, assignmentsPage * pageSize);
  const assignmentFilesById = useMemo(() => {
    const map = new Map<number, HomeworkAssignmentFileRow[]>();
    for (const f of assignmentFilesQuery.data ?? []) {
      const list = map.get(f.assignment_id) ?? [];
      list.push(f);
      map.set(f.assignment_id, list);
    }
    return map;
  }, [assignmentFilesQuery.data]);

  const submissionFilesBySubmissionId = useMemo(() => {
    const map = new Map<number, HomeworkSubmissionFileRow[]>();
    for (const f of submissionFilesQuery.data ?? []) {
      const list = map.get(f.submission_id) ?? [];
      list.push(f);
      map.set(f.submission_id, list);
    }
    return map;
  }, [submissionFilesQuery.data]);

  const requestsTotal = requests.length;
  const requestsPaged = requests.slice((requestsPage - 1) * pageSize, requestsPage * pageSize);

  const bonusRemainingByType = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of allocationsQuery.data ?? []) {
      map.set(a.resource_type, a.professor_bonus_remaining ?? 0);
    }
    return map;
  }, [allocationsQuery.data]);

  if (profesorCheckQuery.isLoading) {
    return (
      <main className="flex min-h-[70vh] items-center justify-center px-4 py-8">
        <section className="w-full max-w-md bg-card p-6 text-sm text-muted-foreground">Se verifica accesul...</section>
      </main>
    );
  }

  if (!profesorCheckQuery.data?.isAuthenticated) {
    return (
      <main className="flex min-h-[70vh] items-center justify-center px-4 py-8">
        <section className="w-full max-w-md bg-card p-6">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Acces restrictionat</h1>
          <p className="mt-2 text-sm text-muted-foreground">Trebuie sa fii autentificat ca profesor pentru aceasta pagina.</p>
          <Link href="/login" className="mt-5 inline-flex rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
            Mergi la logare
          </Link>
        </section>
      </main>
    );
  }

  if (!profesorCheckQuery.data?.isProfesor) {
    return (
      <main className="flex min-h-[70vh] items-center justify-center px-4 py-8">
        <section className="w-full max-w-md bg-card p-6">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Acces interzis</h1>
          <p className="mt-2 text-sm text-muted-foreground">Doar utilizatorii cu rol profesor pot accesa aceasta pagina.</p>
          <Link href="/" className="mt-5 inline-flex rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
            Inapoi acasa
          </Link>
        </section>
      </main>
    );
  }

  async function copyToClipboard(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Link copiat.");
    } catch {
      toast.error("Nu s-a putut copia link-ul.");
    }
  }

  // submisii au pagina separata ("Vezi"), fara preview inline aici

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-4 py-8 md:px-6">
      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">Profesor</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">{course?.title ?? `Curs #${courseId}`}</h1>
          {course?.description ? <p className="mt-2 max-w-3xl text-sm text-muted-foreground">{course.description}</p> : null}
        </div>
        <Link href="/profesor/cursuri" className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground">
          Inapoi la cursuri
        </Link>
      </header>

      <div className="grid gap-6 lg:grid-cols-[320px_1fr] lg:items-start">
        <aside className="lg:sticky lg:top-20">
          <section className="rounded-lg border border-border/70 bg-card p-4 shadow-2xs">
            <div className="text-sm font-semibold tracking-tight text-foreground">Gestionare</div>
            <div className="mt-3 grid grid-cols-3 gap-2 rounded-md bg-muted/10 p-1">
              {(
                [
                  ["materials", "Materiale"],
                  ["homework", "Teme"],
                  ["requests", "Cereri"],
                ] as const
              ).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setView(k)}
                  className={[
                    "h-9 rounded-md px-2 text-xs font-medium transition",
                    view === k ? "bg-card shadow-2xs text-foreground" : "text-muted-foreground hover:text-foreground",
                  ].join(" ")}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="mt-4 text-xs text-muted-foreground">
              ID curs: <span className="font-mono text-foreground">#{courseId}</span>
            </div>
          </section>
        </aside>

        <section className="rounded-lg border border-border/70 bg-card p-4 shadow-2xs md:p-6">
          {view === "materials" ? (
            <>
              <div className="text-sm font-semibold tracking-tight text-foreground">Materiale curs</div>
              <p className="mt-1 text-xs text-muted-foreground">Încarci fișiere (PDF/DOCX) sau pui un URL.</p>

              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <div className="md:col-span-1">
                  <Label className="text-xs" htmlFor="m-title">
                    Titlu (optional)
                  </Label>
                  <Input
                    id="m-title"
                    value={materialTitle}
                    onChange={(e) => setMaterialTitle(e.target.value)}
                    placeholder="Ex: Curs 1"
                  />
                </div>
                <div className="md:col-span-2">
                  <Label className="text-xs">Dropzone (PDF/DOCX)</Label>
                  <div
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      const list = Array.from(e.dataTransfer.files ?? []).filter((f) => f && f.size > 0);
                      setMaterialFiles((prev) => mergeFiles(prev, list));
                    }}
                    className="mt-1 rounded-md border border-dashed border-border px-3 py-3 text-xs text-muted-foreground"
                  >
                    Trage aici fișierele sau folosește selectorul.
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <input
                        type="file"
                        multiple
                        accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                        onChange={(e) => {
                          const list = Array.from(e.target.files ?? []);
                          setMaterialFiles((prev) => mergeFiles(prev, list));
                          e.currentTarget.value = "";
                        }}
                        className="w-full rounded-md border border-input/60 bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-ring"
                      />
                      <Button type="button" variant="outline" size="sm" onClick={() => setMaterialFiles([])} disabled={materialFiles.length === 0}>
                        Golește
                      </Button>
                    </div>
                    {materialFiles.length ? (
                      <div className="mt-3">
                        <div className="text-[11px] text-muted-foreground">
                          Fișiere selectate: <span className="font-mono text-foreground">{materialFiles.length}</span>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {materialFiles.slice(0, 12).map((f) => (
                            <button
                              key={`${f.name}__${f.size}__${f.lastModified}`}
                              type="button"
                              onClick={() => setMaterialFiles((prev) => prev.filter((x) => x !== f))}
                              className="inline-flex items-center gap-1 rounded-md bg-muted/20 px-2 py-1 text-[11px] text-foreground transition hover:bg-muted/30"
                              title="Click pentru a scoate fișierul din listă"
                            >
                              <span className="max-w-[200px] truncate">{f.name}</span>
                              <span className="text-muted-foreground">×</span>
                            </button>
                          ))}
                          {materialFiles.length > 12 ? (
                            <div className="px-2 py-1 text-[11px] text-muted-foreground">+{materialFiles.length - 12}…</div>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="md:col-span-2">
                  <Label className="text-xs" htmlFor="m-url">
                    URL (optional)
                  </Label>
                  <Input
                    id="m-url"
                    value={materialUrl}
                    onChange={(e) => setMaterialUrl(e.target.value)}
                    placeholder="https://..."
                  />
                </div>
                <div className="md:col-span-3">
                  <Label className="text-xs" htmlFor="m-desc">
                    Descriere (optional)
                  </Label>
                  <Input
                    id="m-desc"
                    value={materialDescription}
                    onChange={(e) => setMaterialDescription(e.target.value)}
                  />
                </div>
                <div className="md:col-span-3 flex justify-end">
                  <Button
                    type="button"
                    disabled={addMaterialMutation.isPending}
                    onClick={() => addMaterialMutation.mutate()}
                  >
                    Upload / Adauga
                  </Button>
                </div>
              </div>

              <div className="mt-6">
                {materialsQuery.isLoading ? (
                  <div className="text-sm text-muted-foreground">Se incarca...</div>
                ) : materialsTotal === 0 ? (
                  <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">Nu exista materiale.</div>
                ) : (
                  <>
                    <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                      <div className="space-y-1">
                        <Label htmlFor="mat-search" className="text-xs">
                          Cauta
                        </Label>
                        <Input
                          id="mat-search"
                          value={materialsSearch}
                          onChange={(e) => {
                            setMaterialsSearch(e.target.value);
                            setMaterialsPage(1);
                          }}
                          placeholder="Titlu / descriere..."
                        />
                      </div>
                      <div className="sm:pb-[2px]">
                        <Pagination variant="compact" page={materialsPage} pageSize={pageSize} totalItems={materialsTotal} onPageChange={setMaterialsPage} />
                      </div>
                    </div>

                    <div className="overflow-hidden rounded-md border border-border/60 bg-muted/10 divide-y divide-border/40">
                      {materialsPaged.map((m) => (
                        <div key={m.id} className="flex items-start justify-between gap-3 px-4 py-3">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium text-foreground">{m.title}</div>
                            {m.description ? <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">{m.description}</div> : null}
                            <div className="mt-2 text-[11px] text-muted-foreground">{new Date(m.created_at).toLocaleString()}</div>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <Button size="sm" variant="outline" onClick={() => copyToClipboard(m.url)}>
                              Copy link
                            </Button>
                            <Button asChild size="sm" variant="outline">
                              <a href={m.url} target="_blank" rel="noreferrer">
                                Open
                              </a>
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </>
          ) : view === "homework" ? (
            <>
              <div className="text-sm font-semibold tracking-tight text-foreground">Teme</div>
              <p className="mt-1 text-xs text-muted-foreground">Creezi o temă (cerință + deadline) și atașezi fișiere.</p>

              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <div className="md:col-span-1">
                  <Label className="text-xs" htmlFor="a-title">
                    Titlu
                  </Label>
                  <Input id="a-title" value={assignmentTitle} onChange={(e) => setAssignmentTitle(e.target.value)} placeholder="Tema 1" />
                </div>
                <div className="md:col-span-1">
                  <Label className="text-xs" htmlFor="a-due">
                    Deadline (optional)
                  </Label>
                  <Input
                    id="a-due"
                    type="datetime-local"
                    value={assignmentDueAt}
                    onChange={(e) => setAssignmentDueAt(e.target.value)}
                  />
                </div>
                <div className="md:col-span-3">
                  <Label className="text-xs" htmlFor="a-desc">
                    Descriere (optional)
                  </Label>
                  <Textarea id="a-desc" value={assignmentDescription} onChange={(e) => setAssignmentDescription(e.target.value)} rows={4} />
                </div>
                <div className="md:col-span-3">
                  <Label className="text-xs">Fișiere (optional)</Label>
                  <div
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      const list = Array.from(e.dataTransfer.files ?? []).filter((f) => f && f.size > 0);
                      setAssignmentFiles((prev) => mergeFiles(prev, list));
                    }}
                    className="mt-1 rounded-md border border-dashed border-border px-3 py-3 text-xs text-muted-foreground"
                  >
                    Trage aici fișierele sau folosește selectorul.
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <input
                        type="file"
                        multiple
                        onChange={(e) => {
                          const list = Array.from(e.target.files ?? []);
                          setAssignmentFiles((prev) => mergeFiles(prev, list));
                          e.currentTarget.value = "";
                        }}
                        className="w-full rounded-md border border-input/60 bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-ring"
                      />
                      <Button type="button" variant="outline" size="sm" onClick={() => setAssignmentFiles([])} disabled={assignmentFiles.length === 0}>
                        Golește
                      </Button>
                    </div>
                    {assignmentFiles.length ? (
                      <div className="mt-3">
                        <div className="text-[11px] text-muted-foreground">
                          Fișiere selectate: <span className="font-mono text-foreground">{assignmentFiles.length}</span>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {assignmentFiles.slice(0, 12).map((f) => (
                            <button
                              key={`${f.name}__${f.size}__${f.lastModified}`}
                              type="button"
                              onClick={() => setAssignmentFiles((prev) => prev.filter((x) => x !== f))}
                              className="inline-flex items-center gap-1 rounded-md bg-muted/20 px-2 py-1 text-[11px] text-foreground transition hover:bg-muted/30"
                              title="Click pentru a scoate fișierul din listă"
                            >
                              <span className="max-w-[220px] truncate">{f.name}</span>
                              <span className="text-muted-foreground">×</span>
                            </button>
                          ))}
                          {assignmentFiles.length > 12 ? (
                            <div className="px-2 py-1 text-[11px] text-muted-foreground">+{assignmentFiles.length - 12}…</div>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className="md:col-span-3 flex justify-end">
                  <Button type="button" disabled={createAssignmentMutation.isPending} onClick={() => createAssignmentMutation.mutate()}>
                    Creează tema
                  </Button>
                </div>
              </div>

              <div className="mt-6">
                {assignmentsQuery.isLoading ? (
                  <div className="text-sm text-muted-foreground">Se incarca...</div>
                ) : assignmentsTotal === 0 ? (
                  <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">Nu exista teme.</div>
                ) : (
                  <>
                    <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                      <div className="space-y-1">
                        <Label htmlFor="a-search" className="text-xs">
                          Cauta
                        </Label>
                        <Input
                          id="a-search"
                          value={assignmentsSearch}
                          onChange={(e) => {
                            setAssignmentsSearch(e.target.value);
                            setAssignmentsPage(1);
                          }}
                          placeholder="Titlu / descriere..."
                        />
                      </div>
                      <div className="sm:pb-[2px]">
                        <Pagination
                          variant="compact"
                          page={assignmentsPage}
                          pageSize={pageSize}
                          totalItems={assignmentsTotal}
                          onPageChange={setAssignmentsPage}
                        />
                      </div>
                    </div>

                    <div className="overflow-hidden rounded-md border border-border/60 bg-muted/10 divide-y divide-border/40">
                      {assignmentsPaged.map((a) => {
                        const files = assignmentFilesById.get(a.id) ?? [];
                        const count = files.length;
                        const labels = files
                          .map((f) => f.title?.trim() || "fisier")
                          .filter(Boolean)
                          .slice(0, 3);
                        return (
                          <div
                            key={a.id}
                            role="button"
                            tabIndex={0}
                            onClick={() => {
                              setSelectedAssignmentId(a.id);
                              setTimeout(() => document.getElementById("hw-submissions")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                setSelectedAssignmentId(a.id);
                                setTimeout(() => document.getElementById("hw-submissions")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
                              }
                            }}
                            className={[
                              "w-full px-4 py-3 text-left transition hover:bg-muted/20 cursor-pointer outline-none focus:ring-2 focus:ring-ring/40",
                              selectedAssignmentId === a.id ? "bg-muted/20" : "",
                            ].join(" ")}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="truncate text-sm font-medium text-foreground">{a.title}</div>
                                {a.description ? <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">{a.description}</div> : null}
                                <div className="mt-2 text-[11px] text-muted-foreground">
                                  creat: {new Date(a.created_at).toLocaleString()}
                                  {a.due_at ? ` · deadline: ${new Date(a.due_at).toLocaleString()}` : ""}
                                  {` · fișiere: ${count}`}
                                </div>
                                {count ? (
                                  <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                                    {labels.map((name, idx) => (
                                      <span key={`${a.id}-${idx}`} className="rounded-md bg-muted/20 px-2 py-1">
                                        {name}
                                      </span>
                                    ))}
                                    {count > labels.length ? (
                                      <span className="rounded-md bg-muted/20 px-2 py-1">+{count - labels.length}</span>
                                    ) : null}
                                  </div>
                                ) : null}
                              </div>
                              <div className="shrink-0 flex flex-col items-end gap-2">
                                <div className="text-xs text-muted-foreground font-mono">#{a.id}</div>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    window.open(`/cursuri/${courseId}/teme/${a.id}`, "_blank", "noopener,noreferrer");
                                  }}
                                >
                                  Deschide
                                </Button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div id="hw-submissions" className="mt-6 scroll-mt-24">
                      <div className="flex items-end justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold tracking-tight text-foreground">Submisii</div>
                          <p className="mt-1 text-xs text-muted-foreground">Selectează o temă din listă ca să vezi ce au trimis studenții.</p>
                        </div>
                        {selectedAssignmentId ? (
                          <div className="text-xs text-muted-foreground">
                            Tema: <span className="font-mono text-foreground">#{selectedAssignmentId}</span>
                          </div>
                        ) : null}
                      </div>

                      <div className="mt-3">
                        {!selectedAssignmentId ? (
                          <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">Nicio temă selectată.</div>
                        ) : submissionsQuery.isLoading ? (
                          <div className="text-sm text-muted-foreground">Se incarca...</div>
                        ) : submissionsQuery.isError ? (
                          <div className="rounded-md bg-destructive/5 p-4 text-sm text-destructive">
                            Eroare: <span className="font-mono text-xs">{getErrorMessage(submissionsQuery.error)}</span>
                          </div>
                        ) : (submissionsQuery.data ?? []).length === 0 ? (
                          <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">Nu exista submisii inca.</div>
                        ) : (
                          <div className="overflow-hidden rounded-md border border-border/60 bg-muted/10 divide-y divide-border/40">
                            {(submissionsQuery.data ?? []).map((s) => {
                              const u = s.app_users ? (Array.isArray(s.app_users) ? s.app_users[0] : s.app_users) : null;
                              const studentLabel = u?.full_name?.trim() || u?.email || "Student";
                              const fileCount = submissionFilesBySubmissionId.get(s.id)?.length ?? 0;
                              return (
                                <div key={s.id} className="px-4 py-3">
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                      <div className="truncate text-sm font-medium text-foreground">{studentLabel}</div>
                                      <div className="mt-1 text-[11px] text-muted-foreground">
                                        {new Date(s.created_at).toLocaleString()} · fișiere: {fileCount}
                                      </div>
                                    </div>
                                    <div className="shrink-0 flex flex-col items-end gap-2">
                                      <div className="text-xs text-muted-foreground font-mono">#{s.id}</div>
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() =>
                                          window.open(
                                            `/profesor/cursuri/${courseId}/teme/${selectedAssignmentId}/submisii/${s.id}`,
                                            "_blank",
                                            "noopener,noreferrer",
                                          )
                                        }
                                      >
                                        Vezi
                                      </Button>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="flex items-end justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold tracking-tight text-foreground">Cereri resurse suplimentare</div>
                  <p className="mt-1 text-xs text-muted-foreground">Aprobi din bonus 10% sau escaladezi la admin.</p>
                </div>
                <div className="text-xs text-muted-foreground">
                  Total: <span className="tabular-nums text-foreground">{requests.length}</span>
                </div>
              </div>

              <div className="mt-4">
                {requestsQuery.isLoading ? (
                  <div className="text-sm text-muted-foreground">Se incarca...</div>
                ) : requests.length === 0 ? (
                  <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">Nu exista cereri.</div>
                ) : (
                  <>
                    <div className="mb-4">
                      <Pagination variant="compact" page={requestsPage} pageSize={pageSize} totalItems={requestsTotal} onPageChange={setRequestsPage} />
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>ID</TableHead>
                          <TableHead>Tip</TableHead>
                          <TableHead className="text-right">Cantitate</TableHead>
                        <TableHead className="text-center">In bonus 10%</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Actiuni</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {requestsPaged.map((r) => (
                        <TableRow key={r.id}>
                          {(() => {
                            const remaining = bonusRemainingByType.get(r.resource_type) ?? 0;
                            const canApproveFromBonus = r.status === "pending" && remaining >= r.requested_amount;
                            const label = canApproveFromBonus ? "Da" : "Nu";
                            return (
                              <>
                          <TableCell className="font-mono text-xs text-muted-foreground">#{r.id}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{r.resource_type}</TableCell>
                          <TableCell className="text-right text-xs text-muted-foreground tabular-nums">{r.requested_amount}</TableCell>
                          <TableCell className="text-center text-xs text-muted-foreground">{label}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{r.status}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button
                                type="button"
                                disabled={approveRequestMutation.isPending || !canApproveFromBonus}
                                onClick={() => approveRequestMutation.mutate(r.id)}
                              >
                                Aproba
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                disabled={escalateRequestMutation.isPending || r.status !== "pending"}
                                onClick={() => escalateRequestMutation.mutate(r.id)}
                              >
                                Trimite la admin
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                disabled={rejectRequestMutation.isPending}
                                onClick={() => rejectRequestMutation.mutate(r.id)}
                              >
                                Respinge
                              </Button>
                            </div>
                          </TableCell>
                              </>
                            );
                          })()}
                        </TableRow>
                      ))}
                      </TableBody>
                    </Table>
                  </>
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  );
}

