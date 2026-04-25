"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
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

