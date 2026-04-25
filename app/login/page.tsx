import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import LoginClient from "@/components/auth/LoginClient";

export default async function LoginPage() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const [{ data: isAdmin }, { data: isProfesor }, { data: isAudit }] = await Promise.all([
      supabase.rpc("is_admin", { _user_id: user.id }),
      supabase.rpc("is_profesor", { _user_id: user.id }),
      supabase.rpc("is_audit", { _user_id: user.id }),
    ]);

    if (isAdmin) redirect("/admin");
    if (isAudit) redirect("/audit");
    if (isProfesor) redirect("/profesor/cursuri");
    redirect("/student");
  }

  return <LoginClient />;
}
