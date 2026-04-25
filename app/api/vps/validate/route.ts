import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function env(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function wantsHtml(request: Request) {
  const accept = request.headers.get("accept") ?? "";
  return accept.includes("text/html");
}

function htmlPage(title: string, body: string) {
  return `<!doctype html>
<html lang="ro" class="dark">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <style>
      /* Copied from app/globals.css tokens (dark mode) */
      :root {
        --font-sans: "Oxanium", sans-serif;
        --font-mono: "Source Code Pro", monospace;
        --radius: 0px;
      }
      .dark {
        --background: oklch(0.2178 0 0);
        --foreground: oklch(0.9067 0 0);
        --card: oklch(0.2850 0 0);
        --card-foreground: oklch(0.9067 0 0);
        --muted: oklch(0.2645 0 0);
        --muted-foreground: oklch(0.7058 0 0);
        --primary: oklch(0.6083 0.2090 27.0276);
        --primary-foreground: oklch(1 0 0);
        --destructive: oklch(0.7839 0.1719 68.0943);
        --border: oklch(0.4091 0 0);
      }

      body {
        font-family: var(--font-sans);
        margin: 0;
        padding: 24px;
        background: var(--background);
        color: var(--foreground);
      }
      .card {
        max-width: 720px;
        margin: 0 auto;
        background: var(--card);
        color: var(--card-foreground);
        border: 1px solid var(--border);
        padding: 20px;
        border-radius: var(--radius);
      }
      .muted { color: var(--muted-foreground); font-size: 14px; }
      .mono { font-family: var(--font-mono); }
      .ok { color: var(--primary); }
      .bad { color: var(--destructive); }
    </style>
  </head>
  <body>
    <div class="card">
      ${body}
    </div>
  </body>
</html>`;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  if (!token) {
    return wantsHtml(request)
      ? new Response(htmlPage("VPS validate", `<h2 class="bad">Token lipsa</h2>`), { status: 400, headers: { "content-type": "text/html; charset=utf-8" } })
      : NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

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
  if (tRow.used_at) {
    return wantsHtml(request)
      ? new Response(
          htmlPage("VPS validate", `<h2 class="bad">Token deja folosit</h2><p class="muted mono">${tRow.token}</p>`),
          { status: 409, headers: { "content-type": "text/html; charset=utf-8" } }
        )
      : NextResponse.json({ error: "Token already used" }, { status: 409 });
  }
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
  if (consumeErr) {
    return wantsHtml(request)
      ? new Response(
          htmlPage(
            "VPS validate",
            `<h2 class="bad">Validare esuata</h2>
             <p class="muted">Motiv:</p>
             <p class="mono">${consumeErr.message}</p>
             <p class="muted">De obicei inseamna ca studentul nu are <span class="mono">vps_subscription</span> ramas (adminul trebuie sa aloce mai mult).</p>`
          ),
          { status: 400, headers: { "content-type": "text/html; charset=utf-8" } }
        )
      : NextResponse.json({ error: consumeErr.message }, { status: 400 });
  }

  const { data: afterRow } = await supabase
    .from("course_student_resources")
    .select("granted_amount,consumed_amount")
    .eq("course_id", tRow.course_id)
    .eq("student_id", tRow.student_id)
    .eq("resource_type", "vps_subscription")
    .maybeSingle();

  const granted = Number(afterRow?.granted_amount ?? 0);
  const consumed = Number(afterRow?.consumed_amount ?? 0);
  const remaining = Math.max(0, granted - consumed);

  if (wantsHtml(request)) {
    return new Response(
      htmlPage(
        "VPS validate",
        `<h2 class="ok">Validare inregistrata</h2>
         <p class="muted">Rezultat httpbin: <span class="mono">${isValid ? "valid" : "invalid"}</span></p>
         <p class="muted">Abonamente VPS: primit <span class="mono">${granted}</span> · consumat <span class="mono">${consumed}</span> · ramas <span class="mono">${remaining}</span></p>`
      ),
      { status: 200, headers: { "content-type": "text/html; charset=utf-8" } }
    );
  }

  return NextResponse.json({ ok: true, isValid, granted, consumed, remaining });
}

