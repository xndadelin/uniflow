import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = requestUrl.searchParams.get("next") ?? "/";

  if (code) {
    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);

    await supabase.auth.exchangeCodeForSession(code);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      await supabase.rpc("audit_log", {
        _action: "auth_login_oauth",
        _entity_table: "auth",
        _entity_id: user.id,
        _course_id: null,
        _message: null,
        _metadata: {
          provider: user.app_metadata?.provider ?? null,
          providers: user.app_metadata?.providers ?? null,
        },
      });
    }
  }

  return NextResponse.redirect(new URL(next, requestUrl.origin));
}
