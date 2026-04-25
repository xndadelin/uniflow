"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { createClient } from "@/utils/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type InventoryRow = {
  resource_type: "tokens" | "vps_subscription";
  total_amount: number;
  remaining_amount: number;
};

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

type AdminActivityRow = {
  id: number;
  title: string;
  description: string | null;
  token_cost: number;
  created_at: string;
};

type SuggestedInventoryRow = {
  resource_type: "tokens" | "vps_subscription";
  required_total: number;
  suggested_total: number;
};

export default function AdminResursePage() {
  const supabase = useMemo(() => createClient(), []);
  const [tokensTotal, setTokensTotal] = useState<string>("0");
  const [vpsTotal, setVpsTotal] = useState<string>("0");
  const [selectedCourseId, setSelectedCourseId] = useState<string>("");
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
    queryKey: ["admin-resurse-data", { activitiesLimit, coursesLimit }],
    enabled: adminCheckQuery.data?.isAdmin === true,
    queryFn: async () => {
      const [invRes, coursesRes, activitiesRes, suggestedRes] = await Promise.all([
        supabase.from("resource_inventory").select("resource_type,total_amount,remaining_amount").order("resource_type", { ascending: true }),
        supabase
          .from("courses")
          .select("id,title,max_students,enrollment_open,created_at")
          .order("created_at", { ascending: false })
          .range(0, Math.max(coursesLimit - 1, 0)),
        supabase
          .from("admin_activities")
          .select("id,title,description,token_cost,created_at")
          .order("created_at", { ascending: false })
          .range(0, Math.max(activitiesLimit - 1, 0)),
        supabase.rpc("get_suggested_inventory"),
      ]);

      if (invRes.error) throw invRes.error;
      if (coursesRes.error) throw coursesRes.error;
      if (activitiesRes.error) throw activitiesRes.error;
      if (suggestedRes.error) throw suggestedRes.error;

      return {
        inventory: (invRes.data ?? []) as InventoryRow[],
        courses: (coursesRes.data ?? []) as CourseRow[],
        activities: (activitiesRes.data ?? []) as AdminActivityRow[],
        suggested: (suggestedRes.data ?? []) as SuggestedInventoryRow[],
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

      const { error } = await supabase.rpc("create_admin_activity", {
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
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Eroare."),
  });

  const setInventoryMutation = useMutation({
    mutationFn: async () => {
      const t = Number(tokensTotal);
      const v = Number(vpsTotal);
      if (!Number.isFinite(t) || t < 0) throw new Error("Total tokens invalid.");
      if (!Number.isFinite(v) || v < 0) throw new Error("Total VPS invalid.");

      const [a, b] = await Promise.all([
        supabase.rpc("set_resource_inventory", { _resource_type: "tokens", _total: t }),
        supabase.rpc("set_resource_inventory", { _resource_type: "vps_subscription", _total: v }),
      ]);
      if (a.error) throw a.error;
      if (b.error) throw b.error;
    },
    onSuccess: async () => {
      toast.success("Inventar actualizat.");
      await dataQuery.refetch();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Eroare."),
  });

  const applySuggestedInventoryMutation = useMutation({
    mutationFn: async () => {
      const suggested = dataQuery.data?.suggested ?? [];
      const tokens = suggested.find((s) => s.resource_type === "tokens")?.suggested_total ?? 0;
      const vps = suggested.find((s) => s.resource_type === "vps_subscription")?.suggested_total ?? 0;

      const [a, b] = await Promise.all([
        supabase.rpc("set_resource_inventory", { _resource_type: "tokens", _total: tokens }),
        supabase.rpc("set_resource_inventory", { _resource_type: "vps_subscription", _total: vps }),
      ]);
      if (a.error) throw a.error;
      if (b.error) throw b.error;
    },
    onSuccess: async () => {
      toast.success("Inventar setat la recomandat (>=10% extra).");
      await dataQuery.refetch();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Eroare."),
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
    },
    onSuccess: async () => {
      toast.success("Alocare facuta + distributie automata.");
      await dataQuery.refetch();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Eroare."),
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
    },
    onSuccess: async () => {
      toast.success("Alocare facuta pentru tokens + VPS (auto).");
      await dataQuery.refetch();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Eroare."),
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
      });
      if (error) throw error;
    },
    onSuccess: () => toast.success("Credențiale atribuite + email in outbox (simulat)."),
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Eroare."),
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

  const inventory = dataQuery.data?.inventory ?? [];
  const courses = dataQuery.data?.courses ?? [];
  const activities = dataQuery.data?.activities ?? [];
  const suggested = dataQuery.data?.suggested ?? [];
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
            <h2 className="font-mono text-sm font-semibold text-foreground">Activitati (minim 10)</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Afisez: <span className="font-mono text-foreground">{activitiesCount}</span> (max {activitiesLimit}) · fiecare are token-uri/activitate.
            </p>
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
        <h2 className="font-mono text-sm font-semibold text-foreground">Inventar global</h2>
        <div className="mt-3 rounded-md border border-border/70 bg-muted/10 p-4">
          <div className="text-xs font-medium text-foreground">Recomandare inventar (necesar + minim 10% extra)</div>
          {suggested.length === 0 ? (
            <div className="mt-2 text-xs text-muted-foreground">Nu exista inca cerinte de la profesori.</div>
          ) : (
            <div className="mt-2 space-y-1 text-xs text-muted-foreground">
              {suggested.map((s) => (
                <div key={s.resource_type}>
                  <span className="font-mono text-foreground">{s.resource_type}</span>: necesar {s.required_total} → recomandat {s.suggested_total}
                </div>
              ))}
            </div>
          )}
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              disabled={applySuggestedInventoryMutation.isPending || suggested.length === 0}
              onClick={() => applySuggestedInventoryMutation.mutate()}
              className="inline-flex items-center justify-center bg-muted/30 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-foreground transition hover:bg-muted/50 disabled:opacity-50"
            >
              Seteaza inventar recomandat
            </button>
          </div>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Total tokens</label>
            <input
              value={tokensTotal}
              onChange={(e) => setTokensTotal(e.target.value)}
              type="number"
              min={0}
              className="mt-1 w-full border border-input/60 bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-ring"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Total abonamente VPS</label>
            <input
              value={vpsTotal}
              onChange={(e) => setVpsTotal(e.target.value)}
              type="number"
              min={0}
              className="mt-1 w-full border border-input/60 bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-ring"
            />
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between gap-3">
          <div className="text-xs text-muted-foreground">Setarea reseteaza remaining = total.</div>
          <button
            type="button"
            disabled={setInventoryMutation.isPending}
            onClick={() => setInventoryMutation.mutate()}
            className="inline-flex items-center justify-center bg-primary px-3 py-2 text-xs font-semibold uppercase tracking-wide text-primary-foreground disabled:opacity-50"
          >
            Salveaza inventar
          </button>
        </div>

        <div className="mt-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tip</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Ramas</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {inventory.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="py-8 text-center text-sm text-muted-foreground">
                    Inventar indisponibil (ruleaza schema SQL).
                  </TableCell>
                </TableRow>
              ) : (
                inventory.map((r) => (
                  <TableRow key={r.resource_type}>
                    <TableCell className="font-mono text-xs text-muted-foreground">{r.resource_type}</TableCell>
                    <TableCell className="text-right font-mono text-xs text-muted-foreground">{r.total_amount}</TableCell>
                    <TableCell className="text-right font-mono text-xs text-muted-foreground">{r.remaining_amount}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
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
          <div className="text-xs font-medium text-foreground">Distribuire credențiale VPS via “mail” (simulat)</div>
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
              Genereaza + pune in outbox
            </button>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Pentru punctaj: “mail” e modelat ca `email_outbox` (testabil). Trimiterea reala se face ulterior printr-un worker/edge function.
          </p>
        </div>
      </section>
    </main>
  );
}

