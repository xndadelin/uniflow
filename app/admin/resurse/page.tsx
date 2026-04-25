"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { createClient } from "@/utils/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pagination } from "@/components/Pagination";

function getErrorMessage(err: unknown) {
  if (!err) return "Eroare necunoscuta.";
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  if (typeof err === "object") {
    const anyErr = err as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown };
    const parts: string[] = [];
    if (typeof anyErr.message === "string" && anyErr.message.trim()) parts.push(anyErr.message.trim());
    if (typeof anyErr.details === "string" && anyErr.details.trim()) parts.push(anyErr.details.trim());
    if (typeof anyErr.hint === "string" && anyErr.hint.trim()) parts.push(anyErr.hint.trim());
    if (typeof anyErr.code === "string" && anyErr.code.trim()) parts.push(`code=${anyErr.code.trim()}`);
    if (parts.length) return parts.join(" · ");
  }
  return "Eroare la request.";
}

type CourseRow = {
  id: number;
  title: string;
  max_students: number;
  enrollment_open: boolean;
  created_at: string;
};

type CourseRequirementRow = {
  resource_type: "tokens" | "vps_subscription";
  required_per_student: number;
};

type CourseActivityRow = {
  id: number;
  course_id: number;
  title: string;
  description: string | null;
  token_cost: number;
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

function AdminResurseInner() {
  const supabase = useMemo(() => createClient(), []);
  const searchParams = useSearchParams();
  const initialCourseIdParam = searchParams.get("courseId");
  const [selectedCourseId, setSelectedCourseId] = useState<string>(() => {
    if (initialCourseIdParam && /^\d+$/.test(initialCourseIdParam)) return initialCourseIdParam;
    return "";
  });
  const [allocateType, setAllocateType] = useState<"tokens" | "vps_subscription">("tokens");
  const [allocateAmount, setAllocateAmount] = useState<string>("0");
  const [vpsHost, setVpsHost] = useState<string>("vps.example.com");
  const [activityTitle, setActivityTitle] = useState<string>("");
  const [activityCost, setActivityCost] = useState<string>("10");
  const [activityDesc, setActivityDesc] = useState<string>("");
  const [coursesPage, setCoursesPage] = useState<number>(1);
  const [coursesPageSize, setCoursesPageSize] = useState<number>(10);
  const [activitiesPage, setActivitiesPage] = useState<number>(1);
  const [activitiesPageSize, setActivitiesPageSize] = useState<number>(10);
  const [view, setView] = useState<"activities" | "allocation" | "escalations">("activities");

  const adminCheckQuery = useQuery({
    queryKey: ["admin-check"],
    queryFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return { isAdmin: false, isAuthenticated: false };

      const { data, error } = await supabase.rpc("is_admin", { _user_id: user.id });
      if (error) throw error;
      return { isAdmin: Boolean(data), isAuthenticated: true };
    },
  });

  const dataQuery = useQuery({
    queryKey: ["admin-resurse-data", { coursesPage, coursesPageSize, activitiesPage, activitiesPageSize, selectedCourseId }],
    enabled: adminCheckQuery.data?.isAdmin === true,
    queryFn: async () => {
      const cid = Number(selectedCourseId);
      const hasCourse = Number.isFinite(cid) && cid > 0;

      const coursesFrom = (coursesPage - 1) * coursesPageSize;
      const coursesTo = coursesFrom + coursesPageSize - 1;
      const activitiesFrom = (activitiesPage - 1) * activitiesPageSize;
      const activitiesTo = activitiesFrom + activitiesPageSize - 1;

      const [coursesRes, activitiesRes, escalatedReqRes] = await Promise.all([
        supabase
          .from("courses")
          .select("id,title,max_students,enrollment_open,created_at", { count: "exact" })
          .order("created_at", { ascending: false })
          .range(coursesFrom, coursesTo),
        hasCourse
          ? supabase
              .from("course_activities")
              .select("id,course_id,title,description,token_cost,created_at", { count: "exact" })
              .eq("course_id", cid)
              .order("created_at", { ascending: false })
              .range(activitiesFrom, activitiesTo)
          : supabase.from("course_activities").select("id", { count: "exact" }).limit(0),
        hasCourse
          ? supabase
              .from("course_resource_requests")
              .select("id,course_id,student_id,resource_type,requested_amount,status,created_at")
              .eq("course_id", cid)
              .eq("status", "escalated")
              .order("created_at", { ascending: false })
          : supabase.from("course_resource_requests").select("id").limit(0),
      ]);

      if (coursesRes.error) throw coursesRes.error;
      if (activitiesRes.error) throw activitiesRes.error;
      if (escalatedReqRes.error) throw escalatedReqRes.error;

      return {
        courses: (coursesRes.data ?? []) as CourseRow[],
        coursesCount: coursesRes.count ?? 0,
        activities: (activitiesRes.data ?? []) as CourseActivityRow[],
        activitiesCount: activitiesRes.count ?? 0,
        escalatedRequests: (escalatedReqRes.data ?? []) as ResourceRequestRow[],
      };
    },
  });

  const selectedCourseMeta = useMemo(() => {
    const cid = Number(selectedCourseId);
    if (!Number.isFinite(cid) || cid <= 0) return null;
    return (dataQuery.data?.courses ?? []).find((c) => c.id === cid) ?? null;
  }, [dataQuery.data?.courses, selectedCourseId]);

  const courseRequirementsQuery = useQuery({
    queryKey: ["admin-course-requirements", { courseId: selectedCourseId }],
    enabled: adminCheckQuery.data?.isAdmin === true && Boolean(selectedCourseMeta),
    queryFn: async () => {
      const cid = Number(selectedCourseId);
      const { data, error } = await supabase
        .from("course_resource_requirements")
        .select("resource_type,required_per_student")
        .eq("course_id", cid);
      if (error) throw error;
      return (data ?? []) as CourseRequirementRow[];
    },
  });

  const courseEnrollmentsCountQuery = useQuery({
    queryKey: ["admin-course-enrollments-count", { courseId: selectedCourseId }],
    enabled: adminCheckQuery.data?.isAdmin === true && Boolean(selectedCourseMeta),
    queryFn: async () => {
      const cid = Number(selectedCourseId);
      const { error, count } = await supabase.from("course_enrollments").select("course_id", { head: true, count: "exact" }).eq("course_id", cid);
      if (error) throw error;
      return count ?? 0;
    },
  });

  const requirementsByType = useMemo(() => {
    const reqs = courseRequirementsQuery.data ?? [];
    const map: Partial<Record<CourseRequirementRow["resource_type"], number>> = {};
    for (const r of reqs) {
      map[r.resource_type] = Number(r.required_per_student) || 0;
    }
    return map;
  }, [courseRequirementsQuery.data]);

  const enrolledCount = courseEnrollmentsCountQuery.data ?? 0;
  const maxStudentsForSelected = selectedCourseMeta?.max_students ?? 0;
  const tokensPerStudent = requirementsByType.tokens ?? 0;
  const vpsPerStudent = requirementsByType.vps_subscription ?? 0;
  const tokensNeededNow = Math.max(0, tokensPerStudent * enrolledCount);
  const vpsNeededNow = Math.max(0, vpsPerStudent * enrolledCount);
  const tokensMaxPlan = Math.max(0, tokensPerStudent * maxStudentsForSelected);
  const vpsMaxPlan = Math.max(0, vpsPerStudent * maxStudentsForSelected);

  const createActivityMutation = useMutation({
    mutationFn: async () => {
      const cost = Number(activityCost);
      if (!activityTitle.trim()) throw new Error("Titlu activitate invalid.");
      if (!Number.isFinite(cost) || cost < 0) throw new Error("Token-uri/activitate invalid.");
      const cid = Number(selectedCourseId);
      if (!Number.isFinite(cid) || cid <= 0) throw new Error("Selecteaza un curs pentru activitati.");

      const { error } = await supabase.rpc("create_course_activity", {
        _course_id: cid,
        _title: activityTitle.trim(),
        _description: activityDesc.trim(),
        _token_cost: cost,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Activitate adaugata.");
      setActivityTitle("");
      setActivityDesc("");
      setActivityCost("10");
      await dataQuery.refetch();
    },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });

  const seedCourseActivitiesMutation = useMutation({
    mutationFn: async () => {
      const cid = Number(selectedCourseId);
      if (!Number.isFinite(cid) || cid <= 0) throw new Error("Selecteaza un curs pentru activitati.");
      const { error } = await supabase.rpc("seed_course_activities_defaults", { _course_id: cid });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Activitati default setate pentru curs.");
      await dataQuery.refetch();
    },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });

  const approveEscalatedRequestMutation = useMutation({
    mutationFn: async (requestId: number) => {
      const { error } = await supabase.rpc("admin_approve_escalated_course_resource_request", { _request_id: requestId });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Escalare aprobata (din inventar).");
      await dataQuery.refetch();
    },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });

  const allocateMutation = useMutation({
    mutationFn: async () => {
      const cid = Number(selectedCourseId);
      const amt = Number(allocateAmount);
      if (!Number.isFinite(cid) || cid <= 0) throw new Error("Selecteaza un curs.");
      if (!Number.isFinite(amt) || amt < 0) throw new Error("Cantitate invalida.");

      const { error } = await supabase.rpc("allocate_course_resources_from_inventory", {
        _course_id: cid,
        _resource_type: allocateType,
        _allocated_amount: amt,
      });
      if (error) throw error;

      // If allocating VPS subscriptions, also generate credentials + send emails immediately.
      if (allocateType === "vps_subscription") {
        if (!vpsHost.trim()) throw new Error("Host invalid (pentru VPS).");
        const { error: vpsErr } = await supabase.rpc("assign_vps_credentials_and_queue_emails", {
          _course_id: cid,
          _default_host: vpsHost.trim(),
          _default_port: 22,
          _app_base_url: window.location.origin,
        });
        if (vpsErr) throw vpsErr;

        const res = await fetch(`/api/admin/email-outbox/send?limit=100`, { method: "POST" });
        if (!res.ok) {
          const txt = await res.text().catch(() => "");
          throw new Error(`Trimitere email esuata: ${res.status} ${txt}`.trim());
        }
      }
    },
    onSuccess: async () => {
      toast.success("Alocare facuta + distributie automata.");
      await dataQuery.refetch();
    },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });

  const allocateBothMutation = useMutation({
    mutationFn: async () => {
      const cid = Number(selectedCourseId);
      if (!Number.isFinite(cid) || cid <= 0) throw new Error("Selecteaza un curs.");
      if (!selectedCourseMeta) throw new Error("Selecteaza un curs.");

      // Allocate based on max_students plan (safe >= currently enrolled).
      const ops: Array<Promise<unknown>> = [];
      if (tokensPerStudent > 0) {
        ops.push(
          (async () => {
            const { error } = await supabase.rpc("allocate_course_resources_from_inventory", {
              _course_id: cid,
              _resource_type: "tokens",
              _allocated_amount: tokensMaxPlan,
            });
            if (error) throw error;
          })()
        );
      }
      if (vpsPerStudent > 0) {
        ops.push(
          (async () => {
            const { error } = await supabase.rpc("allocate_course_resources_from_inventory", {
              _course_id: cid,
              _resource_type: "vps_subscription",
              _allocated_amount: vpsMaxPlan,
            });
            if (error) throw error;
          })()
        );
      }

      if (ops.length === 0) {
        throw new Error("Nu exista necesar setat de profesor (0) pentru tokens/VPS.");
      }

      await Promise.all(ops);

      // If we allocated VPS, also generate credentials + send emails immediately.
      if (vpsPerStudent > 0) {
        if (!vpsHost.trim()) throw new Error("Host invalid (pentru VPS).");
        const { error: vpsErr } = await supabase.rpc("assign_vps_credentials_and_queue_emails", {
          _course_id: cid,
          _default_host: vpsHost.trim(),
          _default_port: 22,
          _app_base_url: window.location.origin,
        });
        if (vpsErr) throw vpsErr;

        const res = await fetch(`/api/admin/email-outbox/send?limit=100`, { method: "POST" });
        if (!res.ok) {
          const txt = await res.text().catch(() => "");
          throw new Error(`Trimitere email esuata: ${res.status} ${txt}`.trim());
        }
      }
    },
    onSuccess: async () => {
      toast.success("Alocare facuta pentru tokens + VPS (auto).");
      await dataQuery.refetch();
    },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });

  const vpsEmailMutation = useMutation({
    mutationFn: async () => {
      const cid = Number(selectedCourseId);
      if (!Number.isFinite(cid) || cid <= 0) throw new Error("Selecteaza un curs.");
      if (!vpsHost.trim()) throw new Error("Host invalid.");
      const { error } = await supabase.rpc("assign_vps_credentials_and_queue_emails", {
        _course_id: cid,
        _default_host: vpsHost.trim(),
        _default_port: 22,
        _app_base_url: window.location.origin,
      });
      if (error) throw error;

      const res = await fetch(`/api/admin/email-outbox/send?limit=100`, { method: "POST" });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`Trimitere email esuata: ${res.status} ${txt}`.trim());
      }

      const payload = (await res.json().catch(() => null)) as { sent?: number; failures?: Array<{ id: number; error: string }> } | null;
      return payload;
    },
    onSuccess: (payload) => {
      const sent = payload?.sent ?? null;
      const failures = payload?.failures?.length ?? 0;
      if (failures > 0) {
        toast.error(`Email: ${sent ?? 0} trimise, ${failures} esuate.`);
      } else {
        toast.success(`Credențiale atribuite + email trimis${sent === null ? "" : ` (${sent})`}.`);
      }
    },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });

  if (adminCheckQuery.isLoading) {
    return (
      <main className="flex min-h-[70vh] items-center justify-center px-4 py-8">
        <section className="w-full max-w-md bg-card p-6 text-sm text-muted-foreground">Se verifica accesul...</section>
      </main>
    );
  }

  if (!adminCheckQuery.data?.isAuthenticated) {
    return (
      <main className="flex min-h-[70vh] items-center justify-center px-4 py-8">
        <section className="w-full max-w-md bg-card p-6">
          <h1 className="font-mono text-xl font-semibold text-foreground">Acces restrictionat</h1>
          <p className="mt-2 text-sm text-muted-foreground">Trebuie sa fii autentificat pentru aceasta pagina.</p>
          <Link href="/login" className="mt-4 inline-flex bg-primary px-4 py-2 text-xs font-semibold uppercase tracking-wide text-primary-foreground">
            Mergi la logare
          </Link>
        </section>
      </main>
    );
  }

  if (!adminCheckQuery.data?.isAdmin) {
    return (
      <main className="flex min-h-[70vh] items-center justify-center px-4 py-8">
        <section className="w-full max-w-md bg-card p-6">
          <h1 className="font-mono text-xl font-semibold text-foreground">Acces interzis</h1>
          <p className="mt-2 text-sm text-muted-foreground">Doar utilizatorii cu rol admin pot gestiona resurse.</p>
          <Link href="/" className="mt-4 inline-flex bg-primary px-4 py-2 text-xs font-semibold uppercase tracking-wide text-primary-foreground">
            Inapoi acasa
          </Link>
        </section>
      </main>
    );
  }

  const courses = dataQuery.data?.courses ?? [];
  const activities = dataQuery.data?.activities ?? [];
  const coursesCount = dataQuery.data?.coursesCount ?? 0;
  const activitiesTotalCount = dataQuery.data?.activitiesCount ?? 0;
  const escalatedRequests =
    (dataQuery.data as { escalatedRequests?: ResourceRequestRow[] } | undefined)?.escalatedRequests ?? [];

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-4 py-8 md:px-6">
      <header className="mb-6">
        <p className="font-mono text-xs uppercase tracking-[0.24em] text-primary">Admin</p>
        <h1 className="mt-2 font-mono text-2xl font-semibold tracking-wider text-foreground">Resurse & distributie</h1>
      </header>

      <div className="grid gap-6 lg:grid-cols-[360px_1fr] lg:items-start">
        {/* Sidebar */}
        <aside className="lg:sticky lg:top-20">
          <section className="rounded-lg border border-border/70 bg-card p-4 shadow-2xs">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold tracking-tight text-foreground">Context</div>
              </div>
              <Link href="/admin" className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground">
                Dashboard
              </Link>
            </div>

            <div className="mt-4">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Cursuri</label>
                </div>
              </div>

              <div className="mt-3 overflow-hidden rounded-md border border-border/60">
                {courses.length === 0 ? (
                  <div className="p-3 text-sm text-muted-foreground">Nu există cursuri.</div>
                ) : (
                  <div className="divide-y divide-border/40">
                    {courses.map((c) => {
                      const active = String(c.id) === selectedCourseId;
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => {
                            setSelectedCourseId(String(c.id));
                            setActivitiesPage(1);
                          }}
                          className={[
                            "w-full px-3 py-2 text-left transition",
                            active ? "bg-accent/40" : "hover:bg-muted/20",
                          ].join(" ")}
                        >
                          <div className="text-sm font-medium text-foreground">#{c.id} · {c.title}</div>
                          <div className="mt-0.5 text-[11px] text-muted-foreground">max {c.max_students}</div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              <div className="mt-3">
                <Pagination
                  variant="compact"
                  page={coursesPage}
                  pageSize={coursesPageSize}
                  totalItems={coursesCount}
                  onPageChange={(p) => setCoursesPage(p)}
                  onPageSizeChange={(s) => {
                    setCoursesPageSize(s);
                    setCoursesPage(1);
                  }}
                />
              </div>
              <div className="mt-3 rounded-md border border-dashed border-border p-3 text-sm text-muted-foreground">
                Selectează un curs pentru a vedea activități/alocări/escalări.
              </div>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2 rounded-md bg-muted/10 p-1">
              {(
                [
                  ["activities", "Activități"],
                  ["allocation", "Alocare"],
                  ["escalations", "Escalări"],
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
          </section>

          <section className="mt-4 rounded-lg border border-border/70 bg-card p-4 shadow-2xs">
            <div className="text-sm font-semibold tracking-tight text-foreground">Tipuri resurse</div>
            <p className="mt-2 text-xs text-muted-foreground">
              Enum: <span className="font-mono">tokens</span>, <span className="font-mono">vps_subscription</span>.
            </p>
          </section>
        </aside>

        {/* Main panel */}
        <section className="rounded-lg border border-border/70 bg-card p-4 shadow-2xs md:p-6">
          {view === "activities" ? (
            <>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <div className="text-sm font-semibold tracking-tight text-foreground">Activități (per curs)</div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {selectedCourseMeta ? (
                      <>
                        Afișez <span className="tabular-nums text-foreground">{activities.length}</span> /{" "}
                        <span className="tabular-nums text-foreground">{activitiesTotalCount}</span>
                      </>
                    ) : (
                      <>Selectează un curs.</>
                    )}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={seedCourseActivitiesMutation.isPending || !selectedCourseMeta}
                    onClick={() => seedCourseActivitiesMutation.mutate()}
                    className="inline-flex h-9 items-center justify-center rounded-md bg-muted/30 px-3 text-xs font-semibold uppercase tracking-wide text-foreground transition hover:bg-muted/50 disabled:opacity-50"
                    title="Seteaza/actualizeaza catalogul default (idempotent) pentru curs"
                  >
                    Setează default 10
                  </button>
                </div>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <div className="md:col-span-1">
                  <label className="text-xs font-medium text-muted-foreground">Titlu</label>
                  <input
                    value={activityTitle}
                    onChange={(e) => setActivityTitle(e.target.value)}
                    className="mt-1 h-10 w-full rounded-md border border-input/60 bg-card px-3 text-sm text-foreground outline-none focus:border-ring"
                    placeholder="Ex: rezumat text"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Token-uri / activitate</label>
                  <input
                    value={activityCost}
                    onChange={(e) => setActivityCost(e.target.value)}
                    type="number"
                    min={0}
                    className="mt-1 h-10 w-full rounded-md border border-input/60 bg-card px-3 text-sm text-foreground outline-none focus:border-ring"
                  />
                </div>
                <div className="md:col-span-3">
                  <label className="text-xs font-medium text-muted-foreground">Descriere (optional)</label>
                  <input
                    value={activityDesc}
                    onChange={(e) => setActivityDesc(e.target.value)}
                    className="mt-1 h-10 w-full rounded-md border border-input/60 bg-card px-3 text-sm text-foreground outline-none focus:border-ring"
                    placeholder="Ex: exemplu de interactiune cu agent AI"
                  />
                </div>
                <div className="md:col-span-3 flex justify-end">
                  <button
                    type="button"
                    disabled={createActivityMutation.isPending || !selectedCourseMeta}
                    onClick={() => createActivityMutation.mutate()}
                    className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-3 text-xs font-semibold uppercase tracking-wide text-primary-foreground disabled:opacity-50"
                  >
                    Adaugă activitate
                  </button>
                </div>
              </div>

              <div className="mt-5">
                {selectedCourseMeta ? (
                  <div className="mb-4">
                    <Pagination
                      variant="compact"
                      page={activitiesPage}
                      pageSize={activitiesPageSize}
                      totalItems={activitiesTotalCount}
                      onPageChange={(p) => setActivitiesPage(p)}
                      onPageSizeChange={(s) => {
                        setActivitiesPageSize(s);
                        setActivitiesPage(1);
                      }}
                    />
                  </div>
                ) : null}

                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Activitate</TableHead>
                      <TableHead className="text-right">Token-uri</TableHead>
                      <TableHead className="text-right">Creat la</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {!selectedCourseMeta ? (
                      <TableRow>
                        <TableCell colSpan={3} className="py-10 text-center text-sm text-muted-foreground">
                          Selectează un curs.
                        </TableCell>
                      </TableRow>
                    ) : activities.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={3} className="py-10 text-center text-sm text-muted-foreground">
                          Nu există activități (rulează seed).
                        </TableCell>
                      </TableRow>
                    ) : (
                      activities.map((a) => (
                        <TableRow key={a.id}>
                          <TableCell className="min-w-[260px]">
                            <div className="space-y-0.5">
                              <div className="text-sm font-medium text-foreground">{a.title}</div>
                              {a.description ? <div className="text-xs text-muted-foreground">{a.description}</div> : null}
                            </div>
                          </TableCell>
                          <TableCell className="text-right text-xs text-muted-foreground tabular-nums">{a.token_cost}</TableCell>
                          <TableCell className="text-right text-xs text-muted-foreground">{new Date(a.created_at).toLocaleString()}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </>
          ) : view === "allocation" ? (
            <>
              <div className="text-sm font-semibold tracking-tight text-foreground">Alocare + distribuție automată</div>
              <div className="mt-2 text-xs text-muted-foreground">
                {selectedCourseMeta ? (
                  <>
                    Înrolați: <span className="font-mono text-foreground">{enrolledCount}</span> · max:{" "}
                    <span className="font-mono text-foreground">{maxStudentsForSelected}</span> · necesar/student:{" "}
                    <span className="font-mono text-foreground">{tokensPerStudent}</span> tokens,{" "}
                    <span className="font-mono text-foreground">{vpsPerStudent}</span> vps.
                    <div className="mt-1">
                      Necesar acum: <span className="font-mono text-foreground">{tokensNeededNow}</span> tokens,{" "}
                      <span className="font-mono text-foreground">{vpsNeededNow}</span> vps · plan max:{" "}
                      <span className="font-mono text-foreground">{tokensMaxPlan}</span> tokens,{" "}
                      <span className="font-mono text-foreground">{vpsMaxPlan}</span> vps.
                    </div>
                  </>
                ) : (
                  <>Selectează un curs.</>
                )}
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Tip</label>
                  <select
                    value={allocateType}
                    onChange={(e) => setAllocateType(e.target.value as "tokens" | "vps_subscription")}
                    className="mt-1 h-10 w-full rounded-md border border-input/60 bg-card px-3 text-sm text-foreground outline-none focus:border-ring"
                  >
                    <option value="tokens">tokens</option>
                    <option value="vps_subscription">vps_subscription</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Cantitate</label>
                  <input
                    value={allocateAmount}
                    onChange={(e) => setAllocateAmount(e.target.value)}
                    type="number"
                    min={0}
                    className="mt-1 h-10 w-full rounded-md border border-input/60 bg-card px-3 text-sm text-foreground outline-none focus:border-ring"
                  />
                </div>
                <div className="flex items-end justify-end gap-2">
                  <button
                    type="button"
                    disabled={allocateMutation.isPending || !selectedCourseMeta}
                    onClick={() => allocateMutation.mutate()}
                    className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-3 text-xs font-semibold uppercase tracking-wide text-primary-foreground disabled:opacity-50"
                  >
                    Alocă
                  </button>
                  <button
                    type="button"
                    disabled={allocateBothMutation.isPending || !selectedCourseMeta}
                    onClick={() => allocateBothMutation.mutate()}
                    className="inline-flex h-10 items-center justify-center rounded-md bg-muted/30 px-3 text-xs font-semibold uppercase tracking-wide text-foreground transition hover:bg-muted/50 disabled:opacity-50"
                    title="Aloca automat pentru ambele tipuri (pe baza max_students)"
                  >
                    Auto (tokens + VPS)
                  </button>
                </div>
              </div>

              <div className="mt-5 rounded-md border border-border/70 bg-muted/10 p-4">
                <div className="text-xs font-medium text-foreground">VPS: host + credențiale + email</div>
                <div className="mt-2 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Host VPS</label>
                    <input
                      value={vpsHost}
                      onChange={(e) => setVpsHost(e.target.value)}
                      className="mt-1 h-10 w-full rounded-md border border-input/60 bg-card px-3 text-sm text-foreground outline-none focus:border-ring"
                    />
                  </div>
                  <button
                    type="button"
                    disabled={vpsEmailMutation.isPending || !selectedCourseMeta}
                    onClick={() => vpsEmailMutation.mutate()}
                    className="inline-flex h-10 items-center justify-center rounded-md bg-muted/30 px-3 text-xs font-semibold uppercase tracking-wide text-foreground transition hover:bg-muted/50 disabled:opacity-50"
                  >
                    Retrimite email VPS
                  </button>
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Când aloci <span className="font-mono">vps_subscription</span>, sistemul generează credențiale și trimite email automat.
                </p>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-end justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold tracking-tight text-foreground">Escalări la admin</div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Cereri trimise de profesor când bonusul (10%) nu ajunge. Aprobi din inventarul global.
                  </p>
                </div>
                <div className="text-xs text-muted-foreground">
                  Total: <span className="tabular-nums text-foreground">{escalatedRequests.length}</span>
                </div>
              </div>

              {!selectedCourseMeta ? (
                <div className="mt-4 rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
                  Selectează un curs.
                </div>
              ) : escalatedRequests.length === 0 ? (
                <div className="mt-4 rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
                  Nu există cereri escaladate pentru acest curs.
                </div>
              ) : (
                <div className="mt-4">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>ID</TableHead>
                        <TableHead>Tip</TableHead>
                        <TableHead className="text-right">Cantitate</TableHead>
                        <TableHead className="text-right">Actiune</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {escalatedRequests.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell className="font-mono text-xs text-muted-foreground">#{r.id}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{r.resource_type}</TableCell>
                          <TableCell className="text-right text-xs text-muted-foreground tabular-nums">{r.requested_amount}</TableCell>
                          <TableCell className="text-right">
                            <button
                              type="button"
                              disabled={approveEscalatedRequestMutation.isPending}
                              onClick={() => approveEscalatedRequestMutation.mutate(r.id)}
                              className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-3 text-xs font-semibold uppercase tracking-wide text-primary-foreground disabled:opacity-50"
                            >
                              Aprobă (inventar)
                            </button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </main>
  );
}

export default function AdminResursePage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-[70vh] items-center justify-center px-4 py-8">
          <section className="w-full max-w-md bg-card p-6 text-sm text-muted-foreground">Se incarca...</section>
        </main>
      }
    >
      <AdminResurseInner />
    </Suspense>
  );
}

