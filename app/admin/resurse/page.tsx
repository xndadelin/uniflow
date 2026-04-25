"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { createClient } from "@/utils/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

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
  const [activitiesLimit, setActivitiesLimit] = useState<number>(10);
  const coursesLimit = 10;

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
    queryKey: ["admin-resurse-data", { activitiesLimit, coursesLimit, selectedCourseId }],
    enabled: adminCheckQuery.data?.isAdmin === true,
    queryFn: async () => {
      const cid = Number(selectedCourseId);
      const hasCourse = Number.isFinite(cid) && cid > 0;

      const [coursesRes, activitiesRes] = await Promise.all([
        supabase
          .from("courses")
          .select("id,title,max_students,enrollment_open,created_at")
          .order("created_at", { ascending: false })
          .range(0, Math.max(coursesLimit - 1, 0)),
        hasCourse
          ? supabase
              .from("course_activities")
              .select("id,course_id,title,description,token_cost,created_at")
              .eq("course_id", cid)
              .order("created_at", { ascending: false })
              .range(0, Math.max(activitiesLimit - 1, 0))
          : supabase.from("course_activities").select("id").limit(0),
      ]);

      if (coursesRes.error) throw coursesRes.error;
      if (activitiesRes.error) throw activitiesRes.error;

      return {
        courses: (coursesRes.data ?? []) as CourseRow[],
        activities: (activitiesRes.data ?? []) as CourseActivityRow[],
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
  const activitiesCount = activities.length;

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-8">
      <header className="mb-6">
        <p className="font-mono text-xs uppercase tracking-[0.24em] text-primary">Admin</p>
        <h1 className="mt-2 font-mono text-2xl font-semibold tracking-wider text-foreground">Resurse & distributie</h1>
        <p className="mt-1 text-sm text-muted-foreground">Profesorul seteaza necesarul. Adminul seteaza stocul, aloca si distribuie.</p>
      </header>

      <section className="rounded-lg border border-border bg-card p-4 md:p-6">
        <h2 className="font-mono text-sm font-semibold text-foreground">Tipuri resurse (2/2)</h2>
        <p className="mt-2 text-sm text-muted-foreground">Exista in enum: <span className="font-mono">tokens</span> si <span className="font-mono">vps_subscription</span>.</p>
      </section>

      <section className="mt-6 rounded-lg border border-border bg-card p-4 md:p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="font-mono text-sm font-semibold text-foreground">Activitati (per curs, minim 10)</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {selectedCourseMeta ? (
                <>
                  Curs: <span className="font-mono text-foreground">#{selectedCourseMeta.id}</span> ·{" "}
                  <span className="font-mono text-foreground">{selectedCourseMeta.title}</span> · afisez{" "}
                  <span className="font-mono text-foreground">{activitiesCount}</span> (max {activitiesLimit})
                </>
              ) : (
                <>Selecteaza un curs mai jos ca sa gestionezi activitatile.</>
              )}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={seedCourseActivitiesMutation.isPending || !selectedCourseMeta}
              onClick={() => seedCourseActivitiesMutation.mutate()}
              className="inline-flex items-center justify-center bg-muted/30 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-foreground transition hover:bg-muted/50 disabled:opacity-50"
              title="Seteaza/actualizeaza catalogul default (idempotent) pentru curs"
            >
              Seteaza default 10
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="md:col-span-1">
            <label className="text-xs font-medium text-muted-foreground">Titlu</label>
            <input
              value={activityTitle}
              onChange={(e) => setActivityTitle(e.target.value)}
              className="mt-1 w-full border border-input/60 bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-ring"
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
              className="mt-1 w-full border border-input/60 bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-ring"
            />
          </div>
          <div className="md:col-span-3">
            <label className="text-xs font-medium text-muted-foreground">Descriere (optional)</label>
            <input
              value={activityDesc}
              onChange={(e) => setActivityDesc(e.target.value)}
              className="mt-1 w-full border border-input/60 bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-ring"
              placeholder="Ex: exemplu de interactiune cu agent AI"
            />
          </div>
          <div className="md:col-span-3 flex justify-end">
            <button
              type="button"
              disabled={createActivityMutation.isPending}
              onClick={() => createActivityMutation.mutate()}
              className="inline-flex items-center justify-center bg-muted/30 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-foreground transition hover:bg-muted/50 disabled:opacity-50"
            >
              Adauga activitate
            </button>
          </div>
        </div>

        <div className="mt-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Activitate</TableHead>
                <TableHead className="text-right">Token-uri</TableHead>
                <TableHead className="text-right">Creat la</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {activities.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="py-8 text-center text-sm text-muted-foreground">
                    Nu exista activitati (ruleaza seed).
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
                    <TableCell className="text-right font-mono text-xs text-muted-foreground">{a.token_cost}</TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">{new Date(a.created_at).toLocaleString()}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={() => setActivitiesLimit((prev) => prev + 10)}
            className="inline-flex items-center justify-center bg-muted/30 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-foreground transition hover:bg-muted/50"
          >
            Incarca inca 10
          </button>
        </div>
      </section>

      <section className="mt-6 rounded-lg border border-border bg-card p-4 md:p-6">
        <h2 className="font-mono text-sm font-semibold text-foreground">Alocare + distributie automata</h2>
        <div className="mt-2 text-xs text-muted-foreground">
          {selectedCourseMeta ? (
            <>
              Inrolati: <span className="font-mono text-foreground">{enrolledCount}</span> · max:{" "}
              <span className="font-mono text-foreground">{maxStudentsForSelected}</span> · necesar/student:{" "}
              <span className="font-mono text-foreground">{tokensPerStudent}</span> tokens,{" "}
              <span className="font-mono text-foreground">{vpsPerStudent}</span> vps.
              <div className="mt-1">
                Necesat acum: <span className="font-mono text-foreground">{tokensNeededNow}</span> tokens,{" "}
                <span className="font-mono text-foreground">{vpsNeededNow}</span> vps · plan max:{" "}
                <span className="font-mono text-foreground">{tokensMaxPlan}</span> tokens,{" "}
                <span className="font-mono text-foreground">{vpsMaxPlan}</span> vps.
              </div>
            </>
          ) : (
            <>Selecteaza un curs ca sa vezi necesarul.</>
          )}
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <div className="md:col-span-2">
            <label className="text-xs font-medium text-muted-foreground">Curs</label>
            <select
              value={selectedCourseId}
              onChange={(e) => setSelectedCourseId(e.target.value)}
              className="mt-1 w-full border border-input/60 bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-ring"
            >
              <option value="">Selecteaza curs...</option>
              {courses.map((c) => (
                <option key={c.id} value={String(c.id)}>
                  #{c.id} · {c.title}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground">Tip</label>
            <select
              value={allocateType}
              onChange={(e) => setAllocateType(e.target.value as "tokens" | "vps_subscription")}
              className="mt-1 w-full border border-input/60 bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-ring"
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
              className="mt-1 w-full border border-input/60 bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-ring"
            />
          </div>
        </div>

        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">
            Foloseste inventarul global si ruleaza automat distributia catre studenti (conform necesarului per student).
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <button
              type="button"
              disabled={allocateMutation.isPending}
              onClick={() => allocateMutation.mutate()}
              className="inline-flex items-center justify-center bg-primary px-3 py-2 text-xs font-semibold uppercase tracking-wide text-primary-foreground disabled:opacity-50"
            >
              Aloca
            </button>

            <button
              type="button"
              disabled={allocateBothMutation.isPending || !selectedCourseMeta}
              onClick={() => allocateBothMutation.mutate()}
              className="inline-flex items-center justify-center bg-muted/30 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-foreground transition hover:bg-muted/50 disabled:opacity-50"
              title="Aloca automat pentru ambele tipuri (pe baza max_students)"
            >
              Aloca tokens + VPS (auto)
            </button>
          </div>
        </div>

        <div className="mt-4 rounded-md border border-border/70 bg-muted/10 p-4">
          <div className="text-xs font-medium text-foreground">VPS: host + credențiale + email</div>
          <div className="mt-2 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Host VPS</label>
              <input
                value={vpsHost}
                onChange={(e) => setVpsHost(e.target.value)}
                className="mt-1 w-full border border-input/60 bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-ring"
              />
            </div>
            <button
              type="button"
              disabled={vpsEmailMutation.isPending}
              onClick={() => vpsEmailMutation.mutate()}
              className="inline-flex items-center justify-center bg-muted/30 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-foreground transition hover:bg-muted/50 disabled:opacity-50"
            >
              Retrimite email VPS
            </button>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Cand aloci <span className="font-mono">vps_subscription</span> (manual sau auto), sistemul genereaza credențiale si trimite email automat.
            Acest buton este doar pentru re-trimitere (outbox ramane ca log).
          </p>
        </div>
      </section>
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

