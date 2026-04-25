import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import nodemailer from "nodemailer";
import { createClient } from "@/utils/supabase/server";

type OutboxRow = {
  id: number;
  to_email: string;
  subject: string;
  body: string;
};

function env(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? "20") || 20, 100);

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr) return NextResponse.json({ error: userErr.message }, { status: 401 });
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { data: isAdmin, error: adminErr } = await supabase.rpc("is_admin", { _user_id: user.id });
  if (adminErr) return NextResponse.json({ error: adminErr.message }, { status: 403 });
  if (!isAdmin) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const transporter = nodemailer.createTransport({
    host: env("SMTP_HOST"),
    port: Number(env("SMTP_PORT")),
    secure: false,
    auth: {
      user: env("SMTP_USER"),
      pass: env("SMTP_PASS"),
    },
  });

  const fromEmail = env("SMTP_FROM_EMAIL");
  const fromName = process.env.SMTP_FROM_NAME ?? "UniFlow";

  const { data: rows, error: selectErr } = await supabase
    .from("email_outbox")
    .select("id,to_email,subject,body")
    .is("sent_at", null)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (selectErr) return NextResponse.json({ error: selectErr.message }, { status: 500 });

  let sent = 0;
  const failures: Array<{ id: number; error: string }> = [];

  for (const row of (rows ?? []) as OutboxRow[]) {
    try {
      await transporter.sendMail({
        from: `${fromName} <${fromEmail}>`,
        to: row.to_email,
        subject: row.subject,
        text: row.body,
      });

      const { error: updateErr } = await supabase.from("email_outbox").update({ sent_at: new Date().toISOString() }).eq("id", row.id);
      if (updateErr) throw updateErr;
      sent += 1;
    } catch (e: unknown) {
      failures.push({ id: row.id, error: e instanceof Error ? e.message : "Send failed." });
    }
  }

  return NextResponse.json({ picked: (rows ?? []).length, sent, failures });
}

