"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { createClient } from "@/utils/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Pagination } from "@/components/Pagination";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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
  const [materialsSearch, setMaterialsSearch] = useState<string>("");
  const [materialsPage, setMaterialsPage] = useState<number>(1);
  const [homeworkSearch, setHomeworkSearch] = useState<string>("");
  const [homeworkPage, setHomeworkPage] = useState<number>(1);
  const pageSize = 10;

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

  const course = courseQuery.data;
  const materials = materialsQuery.data ?? [];
  const resources = resourcesQuery.data ?? [];
  const byType = new Map(resources.map((r) => [r.resource_type, r]));
  const tokens = byType.get("tokens");
  const vps = byType.get("vps_subscription");

  const remainingTokens = Math.max(0, (tokens?.granted_amount ?? 0) - (tokens?.consumed_amount ?? 0));
  const remainingVps = Math.max(0, (vps?.granted_amount ?? 0) - (vps?.consumed_amount ?? 0));

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

  const homeworkAll = homeworkQuery.data ?? [];
  const filteredHomework = useMemo(() => {
    const q = homeworkSearch.trim().toLowerCase();
    if (!q) return homeworkAll;
    return homeworkAll.filter((h) => (h.title ?? "").toLowerCase().includes(q));
  }, [homeworkAll, homeworkSearch]);
  const homeworkTotal = filteredHomework.length;
  const homeworkPaged = filteredHomework.slice((homeworkPage - 1) * pageSize, homeworkPage * pageSize);

  if (enrollmentQuery.isLoading) {
    return (
      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-4 py-10 md:px-6 md:py-12">
        <section className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">Se incarca...</section>
      </main>
    );
  }

  if (enrollmentQuery.isError) {
    return (
      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-4 py-10 md:px-6 md:py-12">
        <section className="rounded-lg border border-destructive/40 bg-destructive/5 p-6 text-sm text-destructive">
          Eroare: <span className="font-mono text-xs">{getErrorMessage(enrollmentQuery.error)}</span>
        </section>
      </main>
    );
  }

  if (!enrollmentQuery.data?.isEnrolled) {
    return (
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-4 py-10 md:px-6 md:py-12">
        <section className="rounded-lg border border-border bg-card p-6">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Acces restricționat</h1>
          <p className="mt-2 text-sm text-muted-foreground">Pagina cursului este disponibila doar studentilor inrolati.</p>
          <Link
            href="/"
            className="mt-5 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-xs transition hover:opacity-95"
          >
            Inapoi la cursuri
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-4 py-10 md:px-6 md:py-12">
      <header className="mb-8">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">Curs</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">{course?.title ?? `#${courseId}`}</h1>
        {course?.description ? <p className="mt-2 max-w-3xl text-sm text-muted-foreground">{course.description}</p> : null}
      </header>

      <div className="space-y-10">
        {/* Overview */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold tracking-tight">Overview</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2">
              <Card className="border-border/70 bg-muted/20 shadow-2xs">
                <CardHeader className="pb-2 pt-4">
                  <CardTitle className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                    {formatResourceLabel("tokens")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="text-3xl font-semibold tracking-tight tabular-nums">{remainingTokens}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    total primit: {tokens?.granted_amount ?? 0} · consumat: {tokens?.consumed_amount ?? 0}
                  </div>
                </CardContent>
              </Card>
              <Card className="border-border/70 bg-muted/20 shadow-2xs">
                <CardHeader className="pb-2 pt-4">
                  <CardTitle className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                    {formatResourceLabel("vps_subscription")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="text-3xl font-semibold tracking-tight tabular-nums">{remainingVps}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    total primit: {vps?.granted_amount ?? 0} · consumat: {vps?.consumed_amount ?? 0}
                  </div>
                </CardContent>
              </Card>
            </div>

            {(resourcesQuery.isError || resourcesQuery.isLoading) ? (
              <div className="mt-3 text-sm text-muted-foreground">
                {resourcesQuery.isLoading ? "Se incarca..." : `Eroare: ${getErrorMessage(resourcesQuery.error)}`}
              </div>
            ) : null}
          </CardContent>
        </Card>

        {/* Main actions + info (two columns on desktop) */}
        <div className="grid gap-8 lg:grid-cols-2 lg:items-start">
          <div className="space-y-8">
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-semibold tracking-tight">Consum token-uri</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">
                  Selectezi o activitate, iar sistemul consuma automat <span className="font-mono">token_cost</span>.
                </p>

                <div className="mt-4 grid gap-3">
                  <div className="space-y-1">
                    <Label>Activitate</Label>
                    <Select value={selectedActivityId} onValueChange={setSelectedActivityId}>
                      <SelectTrigger>
                        <SelectValue placeholder="— alege —" />
                      </SelectTrigger>
                      <SelectContent>
                        {(activitiesQuery.data ?? []).map((a) => (
                          <SelectItem key={a.id} value={String(a.id)}>
                            {a.title} (cost: {a.token_cost})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {activitiesQuery.isError ? <div className="text-[11px] text-destructive">{getErrorMessage(activitiesQuery.error)}</div> : null}
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="act-note">Nota (optional)</Label>
                    <Input
                      id="act-note"
                      value={activityNote}
                      onChange={(e) => setActivityNote(e.target.value)}
                      placeholder="Ex: 10 generari imagine"
                    />
                  </div>
                  <div className="flex justify-end">
                    <Button onClick={() => consumeActivityTokensMutation.mutate()} disabled={consumeActivityTokensMutation.isPending}>
                      Consuma automat
                    </Button>
                  </div>
                </div>

                <div className="mt-6">
                  {tokenActivitiesQuery.isLoading ? (
                    <div className="text-sm text-muted-foreground">Se incarca...</div>
                  ) : tokenActivitiesQuery.isError ? (
                    <div className="text-sm text-destructive">Eroare: {getErrorMessage(tokenActivitiesQuery.error)}</div>
                  ) : (tokenActivitiesQuery.data ?? []).length === 0 ? (
                    <div className="text-sm text-muted-foreground">Nu exista activitati inca.</div>
                  ) : (
                    <div className="overflow-hidden rounded-md border border-border/60 bg-muted/15 text-sm divide-y divide-border/30">
                      {(tokenActivitiesQuery.data ?? []).slice(0, 8).map((a) => (
                        <div key={a.id} className="px-4 py-3">
                          <div className="flex items-center justify-between gap-3">
                            <div className="font-mono text-xs text-muted-foreground">#{a.id}</div>
                            <div className="text-xs text-muted-foreground">{new Date(a.created_at).toLocaleString()}</div>
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <Badge variant="secondary">tokens: {a.tokens_used}</Badge>
                            {a.note ? <Badge variant="outline">nota: {a.note}</Badge> : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base font-semibold tracking-tight">Cereri resurse</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 sm:grid-cols-[220px_160px_auto] sm:items-end">
                  <div className="space-y-1">
                    <Label>Tip resursa</Label>
                    <Select value={requestType} onValueChange={(v) => setRequestType(v as StudentResourceRow["resource_type"])}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="tokens">tokens</SelectItem>
                        <SelectItem value="vps_subscription">vps_subscription</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="req-amt">Cantitate</Label>
                    <Input id="req-amt" value={requestAmount} onChange={(e) => setRequestAmount(e.target.value)} type="number" min={1} />
                  </div>
                  <div className="flex sm:justify-end">
                    <Button onClick={() => createRequestMutation.mutate()} disabled={createRequestMutation.isPending}>
                      Cere resurse
                    </Button>
                  </div>
                </div>

                <div className="mt-6">
                  {requestsQuery.isLoading ? (
                    <div className="text-sm text-muted-foreground">Se incarca...</div>
                  ) : requestsQuery.isError ? (
                    <div className="text-sm text-destructive">Eroare: {getErrorMessage(requestsQuery.error)}</div>
                  ) : (requestsQuery.data ?? []).length === 0 ? (
                    <div className="text-sm text-muted-foreground">Nu ai cereri inca.</div>
                  ) : (
                    <div className="overflow-hidden rounded-md border border-border/60 bg-muted/15 text-sm divide-y divide-border/30">
                      {(requestsQuery.data ?? []).slice(0, 10).map((r) => (
                        <div key={r.id} className="px-4 py-3">
                          <div className="flex items-center justify-between gap-3">
                            <div className="font-mono text-xs text-muted-foreground">#{r.id}</div>
                            <div className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</div>
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <Badge variant="secondary">{r.resource_type}</Badge>
                            <Badge variant="outline">cantitate: {r.requested_amount}</Badge>
                            <Badge variant="outline">status: {r.status}</Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-8">
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-semibold tracking-tight">Tema</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/cursuri/${courseId}/teme`}>Vezi temele</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base font-semibold tracking-tight">Materiale</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/cursuri/${courseId}/materiale`}>Vezi materiale</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base font-semibold tracking-tight">VPS</CardTitle>
              </CardHeader>
              <CardContent>
                {vpsCredentialsQuery.isLoading ? (
                  <div className="text-sm text-muted-foreground">Se incarca...</div>
                ) : vpsCredentialsQuery.isError ? (
                  <div className="text-sm text-destructive">Eroare: {getErrorMessage(vpsCredentialsQuery.error)}</div>
                ) : !vpsCredentialsQuery.data ? (
                  <div className="text-sm text-muted-foreground">Nu exista credențiale VPS alocate inca pentru tine.</div>
                ) : (
                  <div className="rounded-md border border-border/60 bg-muted/15 p-4">
                    <div className="text-xs text-muted-foreground">Host/IP</div>
                    <div className="mt-1 font-mono text-sm">{vpsCredentialsQuery.data.host ?? "—"}</div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <div>
                        <div className="text-xs text-muted-foreground">User</div>
                        <div className="mt-1 font-mono text-sm">{vpsCredentialsQuery.data.username}</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">Parola</div>
                        <div className="mt-1 font-mono text-sm">{vpsCredentialsQuery.data.password}</div>
                      </div>
                    </div>
                    <div className="mt-2 text-[11px] text-muted-foreground">Validarea utilizarii abonamentelor se face doar din link-ul primit pe email.</div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </main>
  );
}

