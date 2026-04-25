import Link from "next/link";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { StudentHome } from "@/components/student/StudentHome";

export default async function Home() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: isAdmin }, { data: isProfesor }] = user
    ? await Promise.all([
        supabase.rpc("is_admin", { _user_id: user.id }),
        supabase.rpc("is_profesor", { _user_id: user.id }),
      ])
    : [{ data: false }, { data: false }];

  const displayName =
    user?.user_metadata?.full_name ||
    user?.user_metadata?.name ||
    user?.user_metadata?.user_name ||
    user?.email?.split("@")[0];

  const isAuthenticated = Boolean(user);
  const isStudent = isAuthenticated && !isAdmin && !isProfesor;

  if (isStudent) {
    return <StudentHome />;
  }

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <section className="w-full max-w-3xl bg-card p-8 md:p-10">
        <p className="mb-3 font-mono text-xs uppercase tracking-[0.24em] text-primary">UniFlow</p>
        <h1 className="mb-3 font-mono text-3xl font-semibold tracking-wider text-foreground md:text-4xl">
          {isAuthenticated ? `Salut, ${displayName ?? "utilizator"}` : "Portal autentificare"}
        </h1>
        <p className="mb-8 max-w-2xl text-sm text-muted-foreground md:text-base">
          {isAuthenticated
            ? "Esti conectat. Bine ai revenit in UniFlow."
            : "Intra in platforma cu email + parola sau prin GitHub OAuth."}
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          {isAuthenticated ? (
            <>
              <Link
                href="/"
                className="inline-flex items-center justify-center bg-primary px-4 py-2 text-sm font-semibold uppercase tracking-wide text-primary-foreground transition hover:opacity-90"
              >
                Acasa
              </Link>
              {isAdmin ? (
                <Link
                  href="/admin/roles"
                  className="inline-flex items-center justify-center bg-muted/30 px-4 py-2 text-sm font-semibold uppercase tracking-wide text-foreground transition hover:bg-muted/50"
                >
                  Admin roluri
                </Link>
              ) : isProfesor ? (
                <Link
                  href="/profesor/cursuri"
                  className="inline-flex items-center justify-center bg-muted/30 px-4 py-2 text-sm font-semibold uppercase tracking-wide text-foreground transition hover:bg-muted/50"
                >
                  Profesor cursuri
                </Link>
              ) : (
                <Link
                  href="/login"
                  className="inline-flex items-center justify-center bg-muted/30 px-4 py-2 text-sm font-semibold uppercase tracking-wide text-foreground transition hover:bg-muted/50"
                >
                  Schimba cont
                </Link>
              )}
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="inline-flex items-center justify-center bg-primary px-4 py-2 text-sm font-semibold uppercase tracking-wide text-primary-foreground transition hover:opacity-90"
              >
                Logare
              </Link>
              <Link
                href="/register"
                className="inline-flex items-center justify-center bg-muted/30 px-4 py-2 text-sm font-semibold uppercase tracking-wide text-foreground transition hover:bg-muted/50"
              >
                Inregistrare
              </Link>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
