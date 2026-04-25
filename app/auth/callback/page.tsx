"use client";

import { useEffect, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

export default function AuthCallbackPage() {
  const supabase = useMemo(() => createClient(), []);
  const searchParams = useSearchParams();

  useEffect(() => {
    const code = searchParams.get("code");
    const next = searchParams.get("next") ?? "/";

    const run = async () => {
      try {
        if (code) {
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
      } finally {
        window.location.href = next;
      }
    };

    void run();
  }, [searchParams, supabase]);

  return (
    <main className="flex min-h-[70vh] items-center justify-center px-4 py-10">
      <section className="w-full max-w-md rounded-lg border border-border/60 bg-card p-6 text-sm text-muted-foreground shadow-sm">
        Se finalizeaza autentificarea...
      </section>
    </main>
  );
}

