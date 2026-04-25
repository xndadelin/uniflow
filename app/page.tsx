import Link from "next/link";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { StudentHome } from "@/components/student/StudentHome";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { redirect } from "next/navigation";

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

  if (isAuthenticated && isAdmin) {
    redirect("/admin");
  }

  if (isAuthenticated && isProfesor) {
    redirect("/profesor/cursuri");
  }

  if (isStudent) {
    return <StudentHome />;
  }

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-14 md:py-16">
      <div className="w-full max-w-5xl">
        <Card className="border-border/70 shadow-sm">
          <CardHeader className="pb-2 md:pb-3">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">UniFlow</p>
            <CardTitle className="text-3xl font-semibold tracking-tight md:text-4xl">
              {isAuthenticated ? `Salut, ${displayName ?? "utilizator"}` : "Portal academic"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-8 max-w-2xl text-sm text-muted-foreground md:text-base">
              {isAuthenticated
                ? "Ești conectat. Accesează secțiunea corespunzătoare rolului tău."
                : "Autentifică-te cu email + parolă sau prin GitHub OAuth."}
            </p>

            <div className="grid gap-3 sm:grid-cols-2">
              {isAuthenticated ? (
                <>
                  <Button asChild>
                    <Link href="/">Acasa</Link>
                  </Button>
                  {isAdmin ? (
                    <Button asChild variant="secondary">
                      <Link href="/admin">Admin dashboard</Link>
                    </Button>
                  ) : isProfesor ? (
                    <Button asChild variant="secondary">
                      <Link href="/profesor/cursuri">Cursuri profesor</Link>
                    </Button>
                  ) : (
                    <Button asChild variant="secondary">
                      <Link href="/login">Schimba cont</Link>
                    </Button>
                  )}
                </>
              ) : (
                <>
                  <Button asChild>
                    <Link href="/login">Logare</Link>
                  </Button>
                  <Button asChild variant="secondary">
                    <Link href="/register">Inregistrare</Link>
                  </Button>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
