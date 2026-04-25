import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ ok: true });
  }

  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }

  const payload =
    body && typeof body === "object"
      ? (body as { page?: unknown; details?: unknown })
      : ({} as { page?: unknown; details?: unknown });

  const page = typeof payload.page === "string" ? payload.page : "unknown";
  const details = payload.details && typeof payload.details === "object" ? payload.details : null;

  await supabase.rpc("audit_log", {
    _action: "page_view",
    _entity_table: "page",
    _entity_id: page,
    _course_id: null,
    _message: null,
    _metadata: { page, ...(details ? { details } : {}) },
  });

  return NextResponse.json({ ok: true });
}

