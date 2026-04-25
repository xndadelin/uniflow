import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import nodemailer from "nodemailer";
import { createClient } from "@/utils/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

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

async function sendViaMailerSend(params: {
  apiToken: string;
  fromEmail: string;
  fromName: string;
  toEmail: string;
  subject: string;
  text: string;
}) {
  const res = await fetch("https://api.mailersend.com/v1/email", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.apiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: { email: params.fromEmail, name: params.fromName },
      to: [{ email: params.toEmail }],
      subject: params.subject,
      text: params.text,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`MailerSend failed (${res.status}): ${body}`.trim());
  }
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? "20") || 20, 100);

  const adminKeyHeader = request.headers.get("x-admin-outbox-key");
  const expectedAdminKey = process.env.ADMIN_OUTBOX_KEY;

  const cookieStore = await cookies();
  const supabaseAuthed = createClient(cookieStore);

  // If an admin key is provided, allow service-role execution (useful for CLI/cron).
  const supabase =
    expectedAdminKey && adminKeyHeader && adminKeyHeader === expectedAdminKey
      ? createServiceClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
          auth: { persistSession: false },
        })
      : supabaseAuthed;

  if (!(expectedAdminKey && adminKeyHeader && adminKeyHeader === expectedAdminKey)) {
    const {
      data: { user },
      error: userErr,
    } = await supabaseAuthed.auth.getUser();
    if (userErr) return NextResponse.json({ error: userErr.message }, { status: 401 });
    if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

    const { data: isAdmin, error: adminErr } = await supabaseAuthed.rpc("is_admin", { _user_id: user.id });
    if (adminErr) return NextResponse.json({ error: adminErr.message }, { status: 403 });
    if (!isAdmin) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const mailerSendToken = process.env.MAILERSEND_API_TOKEN;
  const useMailerSend = Boolean(mailerSendToken);

  const fromEmail = useMailerSend ? env("MAILERSEND_FROM_EMAIL") : env("SMTP_FROM_EMAIL");
  const fromName = (useMailerSend ? process.env.MAILERSEND_FROM_NAME : process.env.SMTP_FROM_NAME) ?? "UniFlow";

  const transporter = useMailerSend
    ? null
    : nodemailer.createTransport({
        host: env("SMTP_HOST"),
        port: Number(env("SMTP_PORT")),
        secure: false,
        auth: {
          user: env("SMTP_USER"),
          pass: env("SMTP_PASS"),
        },
      });

  const { data: rows, error: selectErr } = await supabase
    .from("email_outbox")
    .select("id,to_email,subject,body")
    .is("sent_at", null)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (selectErr) return NextResponse.json({ error: selectErr.message }, { status: 500 });

  let sent = 0;
  const failures: Array<{ id: number; error: string }> = [];
  const mode = useMailerSend ? "mailersend_api" : "smtp";

  for (const row of (rows ?? []) as OutboxRow[]) {
    try {
      if (useMailerSend) {
        await sendViaMailerSend({
          apiToken: mailerSendToken!,
          fromEmail,
          fromName,
          toEmail: row.to_email,
          subject: row.subject,
          text: row.body,
        });
      } else {
        await transporter!.sendMail({
          from: `${fromName} <${fromEmail}>`,
          to: row.to_email,
          subject: row.subject,
          text: row.body,
        });
      }

      const { error: updateErr } = await supabase.from("email_outbox").update({ sent_at: new Date().toISOString() }).eq("id", row.id);
      if (updateErr) throw updateErr;
      sent += 1;
    } catch (e: unknown) {
      const errStr =
        e instanceof Error
          ? `${e.name}: ${e.message}`
          : typeof e === "string"
            ? e
            : (() => {
                try {
                  return JSON.stringify(e);
                } catch {
                  return String(e);
                }
              })();
      failures.push({ id: row.id, error: errStr || "Send failed." });
    }
  }

  return NextResponse.json({ mode, picked: (rows ?? []).length, sent, failures });
}

