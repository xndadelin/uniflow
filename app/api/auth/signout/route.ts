import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";

export async function POST() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    await supabase.rpc("audit_log", {
      _action: "auth_logout",
      _entity_table: "auth",
      _entity_id: user.id,
      _course_id: null,
      _message: null,
      _metadata: { provider: user.app_metadata?.provider ?? null },
    });
  }

  await supabase.auth.signOut();
  return NextResponse.json({ ok: true });
}

