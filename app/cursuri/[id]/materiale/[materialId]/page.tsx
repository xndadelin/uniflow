import Link from "next/link";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { StudentCourseMaterialDetailPage } from "@/components/student/StudentCourseMaterialDetailPage";

export default async function CourseMaterialDetailPage(props: { params: Promise<{ id: string; materialId: string }> }) {
  const { id, materialId } = await props.params;
  const courseId = Number(id);
  const mId = Number(materialId);

  if (!Number.isFinite(courseId) || courseId <= 0 || !Number.isFinite(mId) || mId <= 0) {
    return (
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-10">
        <section className="rounded-lg border border-border bg-card p-6">
          <h1 className="font-mono text-xl font-semibold text-foreground">Material invalid</h1>
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
          <p className="mt-2 text-sm text-muted-foreground">Trebuie sa fii autentificat ca student pentru a vedea materialul.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/login" className="inline-flex bg-primary px-4 py-2 text-xs font-semibold uppercase tracking-wide text-primary-foreground">
              Logare
            </Link>
            <Link href="/register" className="inline-flex bg-muted/30 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-foreground">
              Inregistrare
            </Link>
            <Link href="/" className="inline-flex bg-muted/10 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-foreground">
              Inapoi acasa
            </Link>
          </div>
        </section>
      </main>
    );
  }

  return <StudentCourseMaterialDetailPage courseId={courseId} materialId={mId} />;
}

