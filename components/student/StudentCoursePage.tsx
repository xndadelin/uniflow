"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { createClient } from "@/utils/supabase/client";

type CourseRow = {
  id: number;
  title: string;
  description: string | null;
  max_students: number;
  enrollment_open: boolean;
};

type MaterialRow = {
  id: number;
  title: string;
  description: string | null;
  url: string;
  created_at: string;
};

type StudentResourceRow = {
  resource_type: "tokens" | "vps_subscription";
  granted_amount: number;
  consumed_amount: number;
};

type VpsCredentialRow = {
  username: string;
  password: string;
  host: string | null;
  port: number | null;
};

type ResourceRequestRow = {
  id: number;
  resource_type: "tokens" | "vps_subscription";
  requested_amount: number;
  status: "pending" | "approved" | "rejected" | "escalated";
  created_at: string;
};

type HomeworkRow = {
  id: number;
  title: string;
  file_url: string;
  submitted_at: string;
};

type TokenActivityRow = {
  id: number;
  tokens_used: number;
  note: string | null;
  created_at: string;
};

type CourseActivityRow = {
  id: number;
  title: string;
  description: string | null;
  token_cost: number;
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

function formatResourceLabel(t: StudentResourceRow["resource_type"]) {
  return t === "tokens" ? "Token-uri AI" : "Abonamente VPS";
}

export function StudentCoursePage({ courseId }: { courseId: number }) {
  const supabase = useMemo(() => createClient(), []);
  const [requestType, setRequestType] = useState<StudentResourceRow["resource_type"]>("tokens");
  const [requestAmount, setRequestAmount] = useState<string>("1");
  const [homeworkTitle, setHomeworkTitle] = useState<string>("");
  const [homeworkUrl, setHomeworkUrl] = useState<string>("");
  const [selectedActivityId, setSelectedActivityId] = useState<string>("");
  const [activityNote, setActivityNote] = useState<string>("");

  const enrollmentQuery = useQuery({
    queryKey: ["course-enrollment", courseId],
    queryFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return { isEnrolled: false };

      const { data, error } = await supabase.from("course_enrollments").select("course_id").eq("course_id", courseId).maybeSingle();
      if (error) throw error;
      return { isEnrolled: Boolean(data) };
    },
  });

  const courseQuery = useQuery({
    queryKey: ["course", courseId],
    enabled: enrollmentQuery.data?.isEnrolled === true,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("courses")
        .select("id,title,description,max_students,enrollment_open")
        .eq("id", courseId)
        .single();
      if (error) throw error;
      return data as CourseRow;
    },
  });

  const materialsQuery = useQuery({
    queryKey: ["course-materials", courseId],
    enabled: enrollmentQuery.data?.isEnrolled === true,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("course_materials")
        .select("id,title,description,url,created_at")
        .eq("course_id", courseId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as MaterialRow[];
    },
  });

  const resourcesQuery = useQuery({
    queryKey: ["course-student-resources", courseId],
    enabled: enrollmentQuery.data?.isEnrolled === true,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("course_student_resources")
        .select("resource_type,granted_amount,consumed_amount")
        .eq("course_id", courseId);
      if (error) throw error;
      return (data ?? []) as StudentResourceRow[];
    },
  });

  const activitiesQuery = useQuery({
    queryKey: ["course-activities", courseId],
    enabled: enrollmentQuery.data?.isEnrolled === true,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("course_activities")
        .select("id,title,description,token_cost,created_at")
        .eq("course_id", courseId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as CourseActivityRow[];
    },
  });

  const homeworkQuery = useQuery({
    queryKey: ["course-homework-submissions", courseId],
    enabled: enrollmentQuery.data?.isEnrolled === true,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("course_homework_submissions")
        .select("id,title,file_url,submitted_at")
        .eq("course_id", courseId)
        .order("submitted_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as HomeworkRow[];
    },
  });

  const tokenActivitiesQuery = useQuery({
    queryKey: ["course-token-activities", courseId],
    enabled: enrollmentQuery.data?.isEnrolled === true,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("course_token_activities")
        .select("id,tokens_used,note,created_at")
        .eq("course_id", courseId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as TokenActivityRow[];
    },
  });

  const requestsQuery = useQuery({
    queryKey: ["course-resource-requests", courseId],
    enabled: enrollmentQuery.data?.isEnrolled === true,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("course_resource_requests")
        .select("id,resource_type,requested_amount,status,created_at")
        .eq("course_id", courseId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ResourceRequestRow[];
    },
  });

  const createRequestMutation = useMutation({
    mutationFn: async () => {
      const amt = Number(requestAmount);
      if (!Number.isFinite(amt) || amt <= 0) throw new Error("Cantitate invalida.");
      const { error } = await supabase.rpc("request_course_resources", {
        _course_id: courseId,
        _resource_type: requestType,
        _requested_amount: amt,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Cerere trimisa.");
      setRequestAmount("1");
      await requestsQuery.refetch();
    },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });

  const submitHomeworkMutation = useMutation({
    mutationFn: async () => {
      const t = homeworkTitle.trim();
      const u = homeworkUrl.trim();
      if (!t) throw new Error("Titlu invalid.");
      if (!u) throw new Error("URL invalid.");
      const { error } = await supabase.rpc("submit_homework", { _course_id: courseId, _title: t, _file_url: u });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Tema incarcata.");
      setHomeworkTitle("");
      setHomeworkUrl("");
      await homeworkQuery.refetch();
    },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });

  const consumeActivityTokensMutation = useMutation({
    mutationFn: async () => {
      const actId = Number(selectedActivityId);
      if (!Number.isFinite(actId) || actId <= 0) throw new Error("Selecteaza o activitate.");
      const { error } = await supabase.rpc("consume_tokens_for_activity", {
        _course_id: courseId,
        _activity_id: actId,
        _note: activityNote.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Activitate inregistrata. Token-urile au fost consumate automat.");
      setActivityNote("");
      await Promise.all([resourcesQuery.refetch(), tokenActivitiesQuery.refetch()]);
    },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });

  const vpsCredentialsQuery = useQuery({
    queryKey: ["vps-credentials", courseId],
    enabled: enrollmentQuery.data?.isEnrolled === true,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vps_credentials")
        .select("username,password,host,port")
        .eq("course_id", courseId)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as VpsCredentialRow | null;
    },
  });

  if (enrollmentQuery.isLoading) {
    return (
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-10">
        <section className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">Se incarca...</section>
      </main>
    );
  }

  if (enrollmentQuery.isError) {
    return (
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-10">
        <section className="rounded-lg border border-destructive/40 bg-destructive/5 p-6 text-sm text-destructive">
          Eroare: <span className="font-mono text-xs">{getErrorMessage(enrollmentQuery.error)}</span>
        </section>
      </main>
    );
  }

  if (!enrollmentQuery.data?.isEnrolled) {
    return (
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-10">
        <section className="rounded-lg border border-border bg-card p-6">
          <h1 className="font-mono text-xl font-semibold text-foreground">Acces restrictionat</h1>
          <p className="mt-2 text-sm text-muted-foreground">Pagina cursului este disponibila doar studentilor inrolati.</p>
          <Link href="/" className="mt-4 inline-flex bg-primary px-4 py-2 text-xs font-semibold uppercase tracking-wide text-primary-foreground">
            Inapoi la cursuri
          </Link>
        </section>
      </main>
    );
  }

  const course = courseQuery.data;
  const materials = materialsQuery.data ?? [];
  const resources = resourcesQuery.data ?? [];
  const byType = new Map(resources.map((r) => [r.resource_type, r]));
  const tokens = byType.get("tokens");
  const vps = byType.get("vps_subscription");

  const remainingTokens = Math.max(0, (tokens?.granted_amount ?? 0) - (tokens?.consumed_amount ?? 0));
  const remainingVps = Math.max(0, (vps?.granted_amount ?? 0) - (vps?.consumed_amount ?? 0));

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-10">
      <header className="mb-6">
        <p className="font-mono text-xs uppercase tracking-[0.24em] text-primary">Curs</p>
        <h1 className="mt-2 font-mono text-2xl font-semibold tracking-wider text-foreground">{course?.title ?? `#${courseId}`}</h1>
        {course?.description ? <p className="mt-1 text-sm text-muted-foreground">{course.description}</p> : null}
      </header>

      <section className="rounded-lg border border-border bg-card p-4 md:p-6">
        <h2 className="font-mono text-sm font-semibold text-foreground">Resurse digitale disponibile (ramase)</h2>
        {resourcesQuery.isLoading ? (
          <div className="mt-3 rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">Se incarca...</div>
        ) : resourcesQuery.isError ? (
          <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
            Eroare: <span className="font-mono text-xs">{getErrorMessage(resourcesQuery.error)}</span>
          </div>
        ) : (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="rounded-md border border-border/70 bg-muted/10 p-4">
              <div className="text-xs text-muted-foreground">{formatResourceLabel("tokens")}</div>
              <div className="mt-1 font-mono text-2xl font-semibold text-foreground">{remainingTokens}</div>
              <div className="mt-1 text-[11px] text-muted-foreground">
                total primit: {tokens?.granted_amount ?? 0} · consumat: {tokens?.consumed_amount ?? 0}
              </div>
            </div>
            <div className="rounded-md border border-border/70 bg-muted/10 p-4">
              <div className="text-xs text-muted-foreground">{formatResourceLabel("vps_subscription")}</div>
              <div className="mt-1 font-mono text-2xl font-semibold text-foreground">{remainingVps}</div>
              <div className="mt-1 text-[11px] text-muted-foreground">
                total primit: {vps?.granted_amount ?? 0} · consumat: {vps?.consumed_amount ?? 0}
              </div>
            </div>
          </div>
        )}
      </section>

      <section className="mt-6 rounded-lg border border-border bg-card p-4 md:p-6">
        <h2 className="font-mono text-sm font-semibold text-foreground">VPS (credențiale)</h2>
        {vpsCredentialsQuery.isLoading ? (
          <div className="mt-3 rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">Se incarca...</div>
        ) : vpsCredentialsQuery.isError ? (
          <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
            Eroare: <span className="font-mono text-xs">{getErrorMessage(vpsCredentialsQuery.error)}</span>
          </div>
        ) : !vpsCredentialsQuery.data ? (
          <div className="mt-3 rounded-md border border-border/70 bg-muted/10 p-4 text-sm text-muted-foreground">
            Nu exista credențiale VPS alocate inca pentru tine.
          </div>
        ) : (
          <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
            <div className="rounded-md border border-border/70 bg-muted/10 p-4">
              <div className="text-xs text-muted-foreground">Host/IP</div>
              <div className="mt-1 font-mono text-sm text-foreground">{vpsCredentialsQuery.data.host ?? "—"}</div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <div>
                  <div className="text-xs text-muted-foreground">User</div>
                  <div className="mt-1 font-mono text-sm text-foreground">{vpsCredentialsQuery.data.username}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Parola</div>
                  <div className="mt-1 font-mono text-sm text-foreground">{vpsCredentialsQuery.data.password}</div>
                </div>
              </div>
              <div className="mt-2 text-[11px] text-muted-foreground">
                Validarea utilizarii abonamentelor se face doar din link-ul primit pe email.
              </div>
            </div>
          </div>
        )}
      </section>

      <section className="mt-6 rounded-lg border border-border bg-card p-4 md:p-6">
        <h2 className="font-mono text-sm font-semibold text-foreground">Incarca tema</h2>
        <p className="mt-1 text-xs text-muted-foreground">Trimite un link catre tema (ex: Google Drive / GitHub / PDF public).</p>

        <div className="mt-3 grid gap-2 md:grid-cols-3 md:items-end">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Titlu</label>
            <input
              value={homeworkTitle}
              onChange={(e) => setHomeworkTitle(e.target.value)}
              className="mt-1 w-full border border-input/60 bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-ring"
              placeholder="Tema 1"
            />
          </div>
          <div className="md:col-span-2">
            <label className="text-xs font-medium text-muted-foreground">URL</label>
            <input
              value={homeworkUrl}
              onChange={(e) => setHomeworkUrl(e.target.value)}
              className="mt-1 w-full border border-input/60 bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-ring"
              placeholder="https://..."
            />
          </div>
          <div className="md:col-span-3 flex justify-end">
            <button
              type="button"
              disabled={submitHomeworkMutation.isPending}
              onClick={() => submitHomeworkMutation.mutate()}
              className="inline-flex items-center justify-center bg-primary px-3 py-2 text-xs font-semibold uppercase tracking-wide text-primary-foreground disabled:opacity-50"
            >
              Incarca tema
            </button>
          </div>
        </div>

        {homeworkQuery.isLoading ? (
          <div className="mt-3 rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">Se incarca...</div>
        ) : homeworkQuery.isError ? (
          <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
            Eroare: <span className="font-mono text-xs">{getErrorMessage(homeworkQuery.error)}</span>
          </div>
        ) : (homeworkQuery.data ?? []).length === 0 ? (
          <div className="mt-3 rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">Nu ai teme incarcate inca.</div>
        ) : (
          <div className="mt-4 space-y-2">
            {(homeworkQuery.data ?? []).slice(0, 10).map((h) => (
              <a
                key={h.id}
                href={h.file_url}
                target="_blank"
                rel="noreferrer"
                className="block rounded-md border border-border/70 bg-muted/10 p-4 transition hover:bg-muted/20"
              >
                <div className="text-sm font-medium text-foreground">{h.title}</div>
                <div className="mt-2 text-[11px] text-muted-foreground">{new Date(h.submitted_at).toLocaleString()}</div>
              </a>
            ))}
          </div>
        )}
      </section>

      <section className="mt-6 rounded-lg border border-border bg-card p-4 md:p-6">
        <h2 className="font-mono text-sm font-semibold text-foreground">Consum token-uri prin activitati</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Selectezi o activitate, iar sistemul consuma automat <span className="font-mono">token_cost</span>.
        </p>

        <div className="mt-3 grid gap-2 sm:grid-cols-[320px_1fr_auto] sm:items-end">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Activitate</label>
            <select
              value={selectedActivityId}
              onChange={(e) => setSelectedActivityId(e.target.value)}
              className="mt-1 w-full border border-input/60 bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-ring"
            >
              <option value="">— alege —</option>
              {(activitiesQuery.data ?? []).map((a) => (
                <option key={a.id} value={String(a.id)}>
                  {a.title} (cost: {a.token_cost})
                </option>
              ))}
            </select>
            {activitiesQuery.isError ? (
              <div className="mt-1 text-[11px] text-destructive">{getErrorMessage(activitiesQuery.error)}</div>
            ) : null}
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Nota (optional)</label>
            <input
              value={activityNote}
              onChange={(e) => setActivityNote(e.target.value)}
              className="mt-1 w-full border border-input/60 bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-ring"
              placeholder="Ex: 10 generari imagine"
            />
          </div>
          <button
            type="button"
            disabled={consumeActivityTokensMutation.isPending}
            onClick={() => consumeActivityTokensMutation.mutate()}
            className="inline-flex items-center justify-center bg-primary px-3 py-2 text-xs font-semibold uppercase tracking-wide text-primary-foreground disabled:opacity-50"
          >
            Consuma automat
          </button>
        </div>

        {tokenActivitiesQuery.isLoading ? (
          <div className="mt-3 rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">Se incarca...</div>
        ) : tokenActivitiesQuery.isError ? (
          <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
            Eroare: <span className="font-mono text-xs">{getErrorMessage(tokenActivitiesQuery.error)}</span>
          </div>
        ) : (tokenActivitiesQuery.data ?? []).length === 0 ? (
          <div className="mt-3 rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">Nu exista activitati inca.</div>
        ) : (
          <div className="mt-4 space-y-2 text-sm">
            {(tokenActivitiesQuery.data ?? []).slice(0, 10).map((a) => (
              <div key={a.id} className="rounded-md border border-border/70 bg-muted/10 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="font-mono text-xs text-muted-foreground">#{a.id}</div>
                  <div className="text-xs text-muted-foreground">{new Date(a.created_at).toLocaleString()}</div>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="rounded-md bg-muted/30 px-2 py-1 text-xs text-foreground">tokens: {a.tokens_used}</span>
                  {a.note ? <span className="rounded-md bg-muted/30 px-2 py-1 text-xs text-foreground">nota: {a.note}</span> : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="mt-6 rounded-lg border border-border bg-card p-4 md:p-6">
        <h2 className="font-mono text-sm font-semibold text-foreground">Cereri resurse suplimentare</h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-[220px_160px_auto] sm:items-end">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Tip resursa</label>
            <select
              value={requestType}
              onChange={(e) => setRequestType(e.target.value as StudentResourceRow["resource_type"])}
              className="mt-1 w-full border border-input/60 bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-ring"
            >
              <option value="tokens">tokens</option>
              <option value="vps_subscription">vps_subscription</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Cantitate</label>
            <input
              value={requestAmount}
              onChange={(e) => setRequestAmount(e.target.value)}
              type="number"
              min={1}
              className="mt-1 w-full border border-input/60 bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-ring"
            />
          </div>
          <button
            type="button"
            disabled={createRequestMutation.isPending}
            onClick={() => createRequestMutation.mutate()}
            className="inline-flex items-center justify-center bg-primary px-3 py-2 text-xs font-semibold uppercase tracking-wide text-primary-foreground disabled:opacity-50"
          >
            Cere resurse
          </button>
        </div>

        {requestsQuery.isLoading ? (
          <div className="mt-3 rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">Se incarca...</div>
        ) : requestsQuery.isError ? (
          <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
            Eroare: <span className="font-mono text-xs">{getErrorMessage(requestsQuery.error)}</span>
          </div>
        ) : (requestsQuery.data ?? []).length === 0 ? (
          <div className="mt-3 rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
            Nu ai cereri inca.
          </div>
        ) : (
          <div className="mt-4 space-y-2 text-sm">
            {(requestsQuery.data ?? []).map((r) => (
              <div key={r.id} className="rounded-md border border-border/70 bg-muted/10 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="font-mono text-xs text-muted-foreground">#{r.id}</div>
                  <div className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</div>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="rounded-md bg-muted/30 px-2 py-1 text-xs text-foreground">{r.resource_type}</span>
                  <span className="rounded-md bg-muted/30 px-2 py-1 text-xs text-foreground">cantitate: {r.requested_amount}</span>
                  <span className="rounded-md bg-muted/30 px-2 py-1 text-xs text-foreground">status: {r.status}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="mt-6 rounded-lg border border-border bg-card p-4 md:p-6">
        <h2 className="font-mono text-sm font-semibold text-foreground">Materiale incarcate de profesor</h2>
        {materialsQuery.isLoading ? (
          <div className="mt-3 rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">Se incarca...</div>
        ) : materialsQuery.isError ? (
          <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
            Eroare: <span className="font-mono text-xs">{getErrorMessage(materialsQuery.error)}</span>
          </div>
        ) : materials.length === 0 ? (
          <div className="mt-3 rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
            Nu exista materiale incarcate inca.
          </div>
        ) : (
          <div className="mt-4 space-y-2">
            {materials.map((m) => (
              <a
                key={m.id}
                href={m.url}
                target="_blank"
                rel="noreferrer"
                className="block rounded-md border border-border/70 bg-muted/10 p-4 transition hover:bg-muted/20"
              >
                <div className="text-sm font-medium text-foreground">{m.title}</div>
                {m.description ? <div className="mt-1 text-xs text-muted-foreground">{m.description}</div> : null}
                <div className="mt-2 text-[11px] text-muted-foreground">{new Date(m.created_at).toLocaleString()}</div>
              </a>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

