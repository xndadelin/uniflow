import Link from "next/link";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { StudentCourseAssignmentDetailPage } from "@/components/student/StudentCourseAssignmentDetailPage";

export default async function CourseAssignmentDetailPage(props: { params: Promise<{ id: string; assignmentId: string }> }) {
  const { id, assignmentId } = await props.params;
  const courseId = Number(id);
  const aId = Number(assignmentId);

  if (!Number.isFinite(courseId) || courseId <= 0 || !Number.isFinite(aId) || aId <= 0) {
    return (
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-10">
        <section className="rounded-lg border border-border bg-card p-6">
          <h1 className="font-mono text-xl font-semibold text-foreground">Tema invalida</h1>
          <Link href="/" className="mt-4 inline-flex bg-primary px-4 py-2 text-xs font-semibold uppercase tracking-wide text-primary-foreground">
            Inapoi
          </Link>
        </section>
      </main>
    );
  }

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-10">
        <section className="rounded-lg border border-border bg-card p-6">
          <h1 className="font-mono text-xl font-semibold text-foreground">Autentificare necesara</h1>
          <p className="mt-2 text-sm text-muted-foreground">Trebuie sa fii autentificat ca student pentru a vedea tema.</p>
          <Link href="/login" className="mt-4 inline-flex bg-primary px-4 py-2 text-xs font-semibold uppercase tracking-wide text-primary-foreground">
            Logare
          </Link>
        </section>
      </main>
    );
  }

  return <StudentCourseAssignmentDetailPage courseId={courseId} assignmentId={aId} />;
}

