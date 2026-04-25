"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/utils/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Course = {
  id: number;
  teacher_id: string;
  title: string;
  description: string | null;
  max_students: number;
  created_at: string;
};

type Requirement = {
  id: number;
  course_id: number;
  resource_type: "tokens" | "vps_subscription";
  required_per_student: number | null;
  required_amount?: number | null;
};

type RequirementDraft = {
  resource_type: Requirement["resource_type"];
  required_per_student: string;
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

function formatResourceLabel(t: RequirementDraft["resource_type"]) {
  return t === "tokens" ? "Token-uri AI" : "Abonamente VPS";
}

function formatRequirementShort(r: { resource_type: RequirementDraft["resource_type"]; required_per_student: number }, maxStudents: number) {
  const perStudent = Number(r.required_per_student) || 0;
  const total = Math.max(0, perStudent * (Number(maxStudents) || 0));
  return `${perStudent}/student (${total} total)`;
}

function ceil10Percent(n: number) {
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.ceil(n * 0.1);
}

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

export default function ProfesorCursuriPage() {
  const supabase = useMemo(() => createClient(), []);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [maxStudents, setMaxStudents] = useState<string>("30");
  const [requirements, setRequirements] = useState<RequirementDraft[]>([
    { resource_type: "tokens", required_per_student: "" },
    { resource_type: "vps_subscription", required_per_student: "" },
  ]);

  const profesorCheckQuery = useQuery({
    queryKey: ["profesor-check"],
    queryFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        return { isProfesor: false, isAuthenticated: false, userId: null as string | null };
      }

      const { data, error } = await supabase.rpc("is_profesor", { _user_id: user.id });
      if (error) throw error;

      return { isProfesor: Boolean(data), isAuthenticated: true, userId: user.id };
    },
  });

  const coursesQuery = useQuery({
    queryKey: ["profesor-cursuri"],
    enabled: profesorCheckQuery.data?.isProfesor === true,
    queryFn: async () => {
      const { data: courses, error: coursesError } = await supabase
        .from("courses")
        .select("id,teacher_id,title,description,max_students,created_at")
        .order("created_at", { ascending: false });
      if (coursesError) throw coursesError;

      const courseIds = (courses ?? []).map((c) => c.id);
      const { data: reqs, error: reqsError } = courseIds.length
        ? await supabase
            .from("course_resource_requirements")
            .select("id,course_id,resource_type,required_per_student,required_amount")
            .in("course_id", courseIds)
        : { data: [] as Requirement[], error: null };
      if (reqsError) throw reqsError;

      const byCourse = (reqs ?? []).reduce<Record<number, Requirement[]>>((acc, r) => {
        acc[r.course_id] = [...(acc[r.course_id] ?? []), r];
        return acc;
      }, {});

      const { data: materials, error: matErr } = courseIds.length
        ? await supabase
            .from("course_materials")
            .select("id,course_id,title,description,url,created_at")
            .in("course_id", courseIds)
            .order("created_at", { ascending: false })
        : { data: [] as CourseMaterialRow[], error: null };
      if (matErr) throw matErr;

      const { data: requests, error: reqErr2 } = courseIds.length
        ? await supabase
            .from("course_resource_requests")
            .select("id,course_id,student_id,resource_type,requested_amount,status,created_at")
            .in("course_id", courseIds)
            .order("created_at", { ascending: false })
        : { data: [] as ResourceRequestRow[], error: null };
      if (reqErr2) throw reqErr2;

      const requestsByCourse = (requests ?? []).reduce<Record<number, ResourceRequestRow[]>>((acc, r) => {
        acc[r.course_id] = [...(acc[r.course_id] ?? []), r];
        return acc;
      }, {});

      const materialsByCourse = (materials ?? []).reduce<Record<number, CourseMaterialRow[]>>((acc, m) => {
        acc[m.course_id] = [...(acc[m.course_id] ?? []), m];
        return acc;
      }, {});

      return { courses: (courses ?? []) as Course[], requirementsByCourse: byCourse, materialsByCourse, requestsByCourse };
    },
  });

  const [materialDraftByCourse, setMaterialDraftByCourse] = useState<Record<number, { title: string; url: string; description: string }>>({});
  const [materialFilesByCourse, setMaterialFilesByCourse] = useState<Record<number, File[]>>({});

  const addMaterialMutation = useMutation({
    mutationFn: async ({
      courseId,
      title,
      url,
      description,
      files,
    }: {
      courseId: number;
      title: string;
      url: string;
      description: string;
      files: File[];
    }) => {
      const trimmedTitle = title.trim();
      const trimmedUrl = url.trim();
      const desc = description.trim() ? description.trim() : null;
      const hasFiles = (files ?? []).length > 0;

      if (!hasFiles && !trimmedUrl) throw new Error("Trebuie sa incarci cel putin un fisier sau sa pui un URL.");

      const rowsToInsert: Array<{ course_id: number; teacher_id: string | null; title: string; description: string | null; url: string }> = [];

      if (hasFiles) {
        for (const file of files) {
          const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
          const path = `course-${courseId}/${Date.now()}-${safeName}`;
          const uploadRes = await supabase.storage.from("course-materials").upload(path, file, { upsert: false, contentType: file.type });
          if (uploadRes.error) {
            const raw = JSON.stringify(uploadRes.error);
            const msg = String(uploadRes.error.message ?? "Upload esuat.");
            const hint =
              msg.toLowerCase().includes("row-level security") || msg.toLowerCase().includes("permission")
                ? ' Lipsesc policy-urile de INSERT pe `storage.objects` pentru bucket-ul "course-materials".'
                : msg.toLowerCase().includes("bucket")
                  ? ' Verifica daca bucket-ul "course-materials" exista in Supabase Storage.'
                  : "";
            throw new Error(`Upload esuat: ${msg}.${hint} Detalii: ${raw}`);
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
    onSuccess: async (_data, vars) => {
      toast.success("Material(e) adaugat(e).");
      setMaterialDraftByCourse((prev) => ({ ...prev, [vars.courseId]: { title: "", url: "", description: "" } }));
      setMaterialFilesByCourse((prev) => ({ ...prev, [vars.courseId]: [] }));
      await coursesQuery.refetch();
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
      await coursesQuery.refetch();
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
      await coursesQuery.refetch();
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
      await coursesQuery.refetch();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Eroare."),
  });

  const createCourseMutation = useMutation({
    mutationFn: async () => {
      const trimmedTitle = title.trim();
      if (!trimmedTitle) throw new Error("Titlul cursului este obligatoriu.");
      const maxStudentsNum = Number(maxStudents);
      if (!Number.isFinite(maxStudentsNum) || maxStudentsNum <= 0) throw new Error("Numarul maxim de studenti trebuie sa fie > 0.");

      const normalized = requirements
        .map((r) => ({ ...r, required_per_student: Number(r.required_per_student) }))
        .filter((r) => Number.isFinite(r.required_per_student) && r.required_per_student >= 0);

      const hasDuplicateTypes = new Set(normalized.map((r) => r.resource_type)).size !== normalized.length;
      if (hasDuplicateTypes) throw new Error("Nu poti adauga acelasi tip de resursa de doua ori.");

      const { data: insertedCourse, error: courseError } = await supabase
        .from("courses")
        .insert({
          teacher_id: profesorCheckQuery.data?.userId,
          title: trimmedTitle,
          description: description.trim() ? description.trim() : null,
          max_students: maxStudentsNum,
        })
        .select("id")
        .single();

      if (courseError) throw courseError;

      const courseId = insertedCourse.id as number;
      const rows = normalized.map((r) => ({
        course_id: courseId,
        resource_type: r.resource_type,
        required_per_student: r.required_per_student,
        required_amount: 0,
      }));

      if (rows.length) {
        const { error: reqError } = await supabase.from("course_resource_requirements").insert(rows);
        if (reqError) throw reqError;
      }
    },
    onSuccess: () => {
      toast.success("Curs creat.");
      setTitle("");
      setDescription("");
      setMaxStudents("30");
      setRequirements([
        { resource_type: "tokens", required_per_student: "" },
        { resource_type: "vps_subscription", required_per_student: "" },
      ]);
      void coursesQuery.refetch();
    },
    onError: (err: Error) => toast.error(err.message),
  });

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
          <h1 className="font-mono text-xl font-semibold text-foreground">Acces restrictionat</h1>
          <p className="mt-2 text-sm text-muted-foreground">Trebuie sa fii autentificat ca profesor pentru aceasta pagina.</p>
          <Link href="/login" className="mt-4 inline-flex bg-primary px-4 py-2 text-xs font-semibold uppercase tracking-wide text-primary-foreground">
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
          <h1 className="font-mono text-xl font-semibold text-foreground">Acces interzis</h1>
          <p className="mt-2 text-sm text-muted-foreground">Doar utilizatorii cu rol profesor pot crea cursuri.</p>
          <Link href="/" className="mt-4 inline-flex bg-primary px-4 py-2 text-xs font-semibold uppercase tracking-wide text-primary-foreground">
            Inapoi acasa
          </Link>
        </section>
      </main>
    );
  }

  const courses = coursesQuery.data?.courses ?? [];
  const requirementsByCourse = coursesQuery.data?.requirementsByCourse ?? {};
  const materialsByCourse = (coursesQuery.data as { materialsByCourse?: Record<number, CourseMaterialRow[]> } | undefined)?.materialsByCourse ?? {};
  const requestsByCourse = (coursesQuery.data as { requestsByCourse?: Record<number, ResourceRequestRow[]> } | undefined)?.requestsByCourse ?? {};

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-8">
      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.24em] text-primary">Profesor</p>
          <h1 className="mt-2 font-mono text-2xl font-semibold tracking-wider text-foreground">Cursuri</h1>
          <p className="mt-1 text-sm text-muted-foreground">Creeaza cursuri si defineste resursele digitale necesare.</p>
        </div>
      </header>

      <section className="rounded-lg border border-border bg-card p-4 md:p-6">
        <div className="flex flex-col gap-1">
          <h2 className="font-mono text-sm font-semibold text-foreground">Creeaza curs</h2>
          <p className="text-xs text-muted-foreground">
            Defineste necesarul de resurse. La alocare, administratorul adauga automat un bonus de <span className="font-semibold text-foreground">10%</span>.
          </p>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className="text-xs font-medium text-muted-foreground">Titlu</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Inteligenta Artificiala"
              className="mt-1 w-full border border-input/60 bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-ring"
            />
          </div>

          <div className="md:col-span-2">
            <label className="text-xs font-medium text-muted-foreground">Descriere (optional)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Scurt rezumat..."
              className="mt-1 min-h-[90px] w-full resize-y border border-input/60 bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-ring"
            />
          </div>

          <div className="md:max-w-xs">
            <label className="text-xs font-medium text-muted-foreground">Numar maxim studenti</label>
            <input
              type="number"
              value={maxStudents}
              min={1}
              onChange={(e) => setMaxStudents(e.target.value)}
              className="mt-1 w-full border border-input/60 bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-ring"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">Folosit pentru planificare/inscrieri.</p>
          </div>

          <div className="md:col-span-2">
            <label className="text-xs font-medium text-muted-foreground">Resurse digitale necesare</label>
            <div className="mt-2 space-y-2">
              {requirements.length === 0 ? (
                <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
                  Nu ai setat inca resurse. Adauga cel putin una (ex: token-uri).
                </div>
              ) : (
                requirements.map((r, i) => {
                  const perStudent = Number(r.required_per_student) || 0;
                  const totalNeeded = Math.max(0, perStudent * (Number(maxStudents) || 0));
                  const bonusPreview = ceil10Percent(totalNeeded);
                  return (
                    <div key={`${r.resource_type}-${i}`} className="grid gap-2 sm:grid-cols-[260px_140px_1fr_96px] sm:items-center">
                      <select
                        value={r.resource_type}
                        onChange={(e) =>
                          setRequirements((prev) =>
                            prev.map((x, idx) => (idx === i ? { ...x, resource_type: e.target.value as RequirementDraft["resource_type"] } : x))
                          )
                        }
                        className="w-full border border-input/60 bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-ring"
                      >
                        <option value="tokens">Token-uri AI</option>
                        <option value="vps_subscription">Abonamente VPS</option>
                      </select>

                      <input
                        type="number"
                        min={0}
                        value={r.required_per_student}
                        onChange={(e) =>
                          setRequirements((prev) =>
                            prev.map((x, idx) => (idx === i ? { ...x, required_per_student: e.target.value } : x))
                          )
                        }
                        className="w-full border border-input/60 bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-ring"
                      />

                      <div className="text-[11px] text-muted-foreground sm:text-xs">
                        {perStudent}/student → {totalNeeded} total · Bonus 10%: <span className="font-mono text-foreground">{bonusPreview}</span>
                      </div>

                      <button
                        type="button"
                        onClick={() => setRequirements((prev) => prev.filter((_, idx) => idx !== i))}
                        className="border border-input/60 bg-card px-3 py-2 text-xs font-semibold uppercase tracking-wide text-foreground transition hover:bg-muted/40"
                        title="Sterge rand"
                      >
                        Sterge
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <button
                type="button"
                onClick={() => setRequirements((prev) => [...prev, { resource_type: "tokens", required_per_student: "" }])}
                className="inline-flex items-center justify-center border border-border bg-muted/20 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-foreground transition hover:bg-muted/40"
              >
                Adauga resursa
              </button>
              <button
                type="button"
                disabled={createCourseMutation.isPending}
                onClick={() => createCourseMutation.mutate()}
                className="inline-flex items-center justify-center bg-primary px-3 py-2 text-xs font-semibold uppercase tracking-wide text-primary-foreground disabled:opacity-50"
              >
                {createCourseMutation.isPending ? "Se creeaza..." : "Creeaza curs"}
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-6 rounded-lg border border-border bg-card p-4 md:p-6">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="font-mono text-sm font-semibold text-foreground">Cursurile mele</h2>
            <p className="text-xs text-muted-foreground">Lista cursurilor create de tine, cu resursele declarate.</p>
          </div>
        </div>

        {coursesQuery.isLoading ? (
          <div className="mt-4 rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">Se incarca...</div>
        ) : coursesQuery.isError ? (
          <div className="mt-4 rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
            Eroare la incarcarea cursurilor. Incearca refresh.
          </div>
        ) : (
          <div className="mt-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[64px] text-center">#</TableHead>
                  <TableHead>Titlu</TableHead>
                  <TableHead className="text-right">Max studenti</TableHead>
                  <TableHead>Resurse necesare</TableHead>
                  <TableHead className="text-right">Creat la</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {courses.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                      Inca nu ai cursuri. Creeaza primul curs mai sus.
                    </TableCell>
                  </TableRow>
                ) : (
                  courses.map((c, idx) => {
                    const reqs = (requirementsByCourse[c.id] ?? []).sort((a, b) => a.resource_type.localeCompare(b.resource_type));
                    return (
                      <TableRow key={c.id}>
                        <TableCell className="text-center font-mono text-xs text-muted-foreground">{idx + 1}</TableCell>
                        <TableCell className="min-w-[220px]">
                          <div className="space-y-0.5">
                            <p className="text-sm font-medium text-foreground">{c.title}</p>
                            {c.description ? <p className="text-xs text-muted-foreground">{c.description}</p> : null}
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs text-muted-foreground">{c.max_students}</TableCell>
                        <TableCell className="min-w-[260px] text-xs text-muted-foreground">
                          {reqs.length === 0 ? (
                            "—"
                          ) : (
                            <div className="space-y-0.5">
                              <div>
                                {reqs
                                  .map((r) => ({
                                    resource_type: r.resource_type,
                                    required_per_student: r.required_per_student ?? (r.required_amount ?? 0),
                                  }))
                                  .map((r) => formatRequirementShort(r, c.max_students))
                                  .join(", ")}
                              </div>
                              <div className="text-[11px] text-muted-foreground">
                                Bonus profesor (10%):{" "}
                                <span className="font-mono text-foreground">
                                  {reqs
                                    .map((r) => {
                                      const perStudent = r.required_per_student ?? (r.required_amount ?? 0);
                                      const total = Math.max(0, perStudent * c.max_students);
                                      return `${formatResourceLabel(r.resource_type)}: ${ceil10Percent(total)}`;
                                    })
                                    .join(" · ")}
                                </span>
                              </div>
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground">
                          {new Date(c.created_at).toLocaleString()}
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

      <section className="mt-6 rounded-lg border border-border bg-card p-4 md:p-6">
        <h2 className="font-mono text-sm font-semibold text-foreground">Materiale (pe curs)</h2>
        <p className="mt-1 text-xs text-muted-foreground">Poti face drag & drop sau selecta mai multe fisiere (PDF/DOCX) + optional un URL.</p>

        {courses.map((c) => {
          const mats = materialsByCourse[c.id] ?? [];
          const draft = materialDraftByCourse[c.id] ?? { title: "", url: "", description: "" };
          const files = materialFilesByCourse[c.id] ?? [];

          return (
            <div key={`materials-${c.id}`} className="mt-4 rounded-md border border-border/70 bg-muted/10 p-4">
              <div className="font-mono text-xs text-muted-foreground">Curs #{c.id}</div>
              <div className="text-sm font-medium text-foreground">{c.title}</div>

              <div className="mt-3 grid gap-2 md:grid-cols-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Titlu (optional)</label>
                  <input
                    value={draft.title}
                    onChange={(e) => setMaterialDraftByCourse((prev) => ({ ...prev, [c.id]: { ...draft, title: e.target.value } }))}
                    className="mt-1 w-full border border-input/60 bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-ring"
                    placeholder="Daca incarci mai multe, se aplica la toate"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="text-xs font-medium text-muted-foreground">Dropzone (PDF/DOCX)</label>
                  <div
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      const list = Array.from(e.dataTransfer.files ?? []).filter((f) => f && f.size > 0);
                      setMaterialFilesByCourse((prev) => ({ ...prev, [c.id]: mergeFiles(prev[c.id] ?? [], list) }));
                    }}
                    className="mt-1 rounded-md border border-dashed border-border px-3 py-3 text-xs text-muted-foreground"
                  >
                    Trage aici fisierele sau foloseste butonul de selectare.
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <input
                        type="file"
                        multiple
                        accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                        onChange={(e) => {
                          const list = Array.from(e.target.files ?? []);
                          setMaterialFilesByCourse((prev) => ({ ...prev, [c.id]: mergeFiles(prev[c.id] ?? [], list) }));
                          e.currentTarget.value = "";
                        }}
                        className="w-full border border-input/60 bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-ring"
                      />
                      {files.length ? (
                        <button
                          type="button"
                          onClick={() => setMaterialFilesByCourse((prev) => ({ ...prev, [c.id]: [] }))}
                          className="bg-muted/30 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-foreground transition hover:bg-muted/50"
                        >
                          Goleste
                        </button>
                      ) : null}
                    </div>
                    {files.length ? (
                      <div className="mt-2 text-[11px] text-muted-foreground">
                        Selectate: <span className="font-mono text-foreground">{files.length}</span>
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="md:col-span-2">
                  <label className="text-xs font-medium text-muted-foreground">URL (optional)</label>
                  <input
                    value={draft.url}
                    onChange={(e) => setMaterialDraftByCourse((prev) => ({ ...prev, [c.id]: { ...draft, url: e.target.value } }))}
                    className="mt-1 w-full border border-input/60 bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-ring"
                    placeholder="https://..."
                  />
                </div>
                <div className="md:col-span-3">
                  <label className="text-xs font-medium text-muted-foreground">Descriere (optional)</label>
                  <input
                    value={draft.description}
                    onChange={(e) => setMaterialDraftByCourse((prev) => ({ ...prev, [c.id]: { ...draft, description: e.target.value } }))}
                    className="mt-1 w-full border border-input/60 bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-ring"
                  />
                </div>
              </div>

              <div className="mt-3 flex justify-end">
                <button
                  type="button"
                  disabled={addMaterialMutation.isPending}
                  onClick={() =>
                    addMaterialMutation.mutate({
                      courseId: c.id,
                      title: draft.title,
                      url: draft.url,
                      description: draft.description,
                      files,
                    })
                  }
                  className="inline-flex items-center justify-center bg-primary px-3 py-2 text-xs font-semibold uppercase tracking-wide text-primary-foreground disabled:opacity-50"
                >
                  Upload / Adauga
                </button>
              </div>

              <div className="mt-3 text-xs text-muted-foreground">Materiale curente: {mats.length}</div>
              {mats.length ? (
                <div className="mt-2 space-y-1">
                  {mats.slice(0, 8).map((m) => (
                    <a key={m.id} href={m.url} target="_blank" rel="noreferrer" className="block text-xs text-foreground underline">
                      {m.title}
                    </a>
                  ))}
                </div>
              ) : (
                <div className="mt-2 rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">Nu exista materiale.</div>
              )}
            </div>
          );
        })}
      </section>

      <section className="mt-6 rounded-lg border border-border bg-card p-4 md:p-6">
        <h2 className="font-mono text-sm font-semibold text-foreground">Cereri resurse suplimentare (aprobare)</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Aprobi din bonus 10%. Daca bonusul nu ajunge, folosesti „Trimite la admin”.
        </p>

        {courses.map((c) => {
          const reqRequests = (requestsByCourse[c.id] ?? []).filter((r) => r.status === "pending" || r.status === "escalated");
          return (
            <div key={`requests-${c.id}`} className="mt-4 rounded-md border border-border/70 bg-muted/10 p-4">
              <div className="font-mono text-xs text-muted-foreground">Curs #{c.id}</div>
              <div className="text-sm font-medium text-foreground">{c.title}</div>

              <div className="mt-3 text-xs text-muted-foreground">Cereri (pending/escalated): {reqRequests.length}</div>
              {reqRequests.length ? (
                <div className="mt-2 space-y-2">
                  {reqRequests.slice(0, 10).map((r) => (
                    <div key={r.id} className="rounded-md border border-border/70 bg-card p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="font-mono text-xs text-muted-foreground">#{r.id}</div>
                        <div className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</div>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2 text-xs">
                        <span className="rounded-md bg-muted/30 px-2 py-1">{r.resource_type}</span>
                        <span className="rounded-md bg-muted/30 px-2 py-1">cantitate: {r.requested_amount}</span>
                        <span className="rounded-md bg-muted/30 px-2 py-1">status: {r.status}</span>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={approveRequestMutation.isPending}
                          onClick={() => approveRequestMutation.mutate(r.id)}
                          className="bg-primary px-3 py-2 text-xs font-semibold uppercase tracking-wide text-primary-foreground disabled:opacity-50"
                        >
                          Aproba (bonus)
                        </button>
                        <button
                          type="button"
                          disabled={escalateRequestMutation.isPending}
                          onClick={() => escalateRequestMutation.mutate(r.id)}
                          className="bg-muted/30 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-foreground transition hover:bg-muted/50 disabled:opacity-50"
                        >
                          Trimite la admin
                        </button>
                        <button
                          type="button"
                          disabled={rejectRequestMutation.isPending}
                          onClick={() => rejectRequestMutation.mutate(r.id)}
                          className="bg-muted/30 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-foreground transition hover:bg-muted/50 disabled:opacity-50"
                        >
                          Respinge
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-2 rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">Nu exista cereri.</div>
              )}
            </div>
          );
        })}
      </section>
    </main>
  );
}

