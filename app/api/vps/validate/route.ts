import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function env(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });

  const supabase = createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });

  // Resolve token -> course/student + credentials
  const { data: tRow, error: tErr } = await supabase
    .from("vps_email_validation_tokens")
    .select("token,course_id,student_id,used_at,expires_at")
    .eq("token", token)
    .maybeSingle();

  if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 });
  if (!tRow) return NextResponse.json({ error: "Invalid token" }, { status: 404 });
  if (tRow.used_at) return NextResponse.json({ error: "Token already used" }, { status: 409 });
  if (tRow.expires_at && new Date(tRow.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: "Token expired" }, { status: 410 });
  }

  const { data: cred, error: cErr } = await supabase
    .from("vps_credentials")
    .select("host,port,username,password")
    .eq("course_id", tRow.course_id)
    .eq("student_id", tRow.student_id)
    .maybeSingle();

  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 });
  if (!cred || !cred.host) return NextResponse.json({ error: "Missing credentials" }, { status: 400 });

  // Validate via httpbin using GET args echo (credentials are sent to httpbin as required).
  const httpbinUrl =
    `https://httpbin.org/get?course_id=${encodeURIComponent(String(tRow.course_id))}` +
    `&host=${encodeURIComponent(String(cred.host))}` +
    `&port=${encodeURIComponent(String(cred.port ?? 22))}` +
    `&username=${encodeURIComponent(String(cred.username))}` +
    `&password=${encodeURIComponent(String(cred.password))}`;

  const res = await fetch(httpbinUrl);
  const json = (await res.json().catch(() => null)) as { args?: Record<string, string> } | null;
  const args = json?.args ?? {};

  const isValid =
    res.ok &&
    args["username"] === String(cred.username) &&
    args["password"] === String(cred.password) &&
    args["host"] === String(cred.host) &&
    args["port"] === String(cred.port ?? 22);

  const note = isValid
    ? "Validare VPS via email link (httpbin GET args match)."
    : `Validare VPS via email link (httpbin status=${res.status}).`;

  const { error: consumeErr } = await supabase.rpc("consume_vps_validation_from_token", {
    _token: token,
    _is_valid: isValid,
    _note: note,
  });
  if (consumeErr) return NextResponse.json({ error: consumeErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, isValid });
}

