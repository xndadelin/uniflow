"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";

type CourseHit = { id: number; title: string };
type UserHit = { id: string; full_name: string | null; email: string | null };
type RequestHit = {
  id: number;
  course_id: number;
  student_id: string;
  status: string;
  resource_type: string;
  requested_amount: number;
  created_at: string;
};
type AuditActionHit = { action: string; entity_table: string | null };
export type CommandPaletteProps = {
  isAuthenticated: boolean;
  isAdmin: boolean;
  isProfesor: boolean;
  isAudit: boolean;
};

function isMac() {
  if (typeof navigator === "undefined") return false;
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform);
}

export function CommandPalette({ isAuthenticated, isAdmin, isProfesor, isAudit }: CommandPaletteProps) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [courses, setCourses] = useState<CourseHit[]>([]);
  const [users, setUsers] = useState<UserHit[]>([]);
  const [requests, setRequests] = useState<RequestHit[]>([]);
  const [auditActions, setAuditActions] = useState<AuditActionHit[]>([]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = isMac() ? e.metaKey : e.ctrlKey;
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener("uniflow:open-command-palette", onOpen);
    return () => window.removeEventListener("uniflow:open-command-palette", onOpen);
  }, []);

  useEffect(() => {
    if (!open) return;
    const query = q.trim();
    if (!query) {
      return;
    }

    let cancelled = false;
    const t = window.setTimeout(async () => {
      setLoading(true);
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        const ilike = `%${query.replace(/%/g, "")}%`;
        let hits: CourseHit[] = [];
        let userHits: UserHit[] = [];
        let requestHits: RequestHit[] = [];
        let auditActionHits: AuditActionHit[] = [];

        if (isAdmin || isAudit) {
          const res = await supabase.from("courses").select("id,title").ilike("title", ilike).order("created_at", { ascending: false }).limit(8);
          if (!res.error) hits = (res.data ?? []) as CourseHit[];
        } else if (isProfesor && user) {
          const res = await supabase
            .from("courses")
            .select("id,title")
            .eq("teacher_id", user.id)
            .ilike("title", ilike)
            .order("created_at", { ascending: false })
            .limit(8);
          if (!res.error) hits = (res.data ?? []) as CourseHit[];
        } else if (user) {
          // Student: allow searching across all courses (RLS-safe).
          const res = await supabase.from("courses").select("id,title").ilike("title", ilike).order("created_at", { ascending: false }).limit(8);
          if (!res.error) hits = (res.data ?? []) as CourseHit[];
        }

        if (isAdmin) {
          const res = await supabase.from("app_users").select("id,full_name,email").or(`full_name.ilike.${ilike},email.ilike.${ilike}`).limit(8);
          if (!res.error) userHits = (res.data ?? []) as UserHit[];

          const reqRes = await supabase
            .from("course_resource_requests")
            .select("id,course_id,student_id,status,resource_type,requested_amount,created_at")
            .order("created_at", { ascending: false })
            .limit(80);
          if (!reqRes.error) {
            const rows = (reqRes.data ?? []) as RequestHit[];
            const ql = query.toLowerCase();
            requestHits = rows
              .filter((r) => {
                const hay = `${r.id} ${r.course_id} ${r.student_id} ${r.status} ${r.resource_type} ${r.requested_amount}`.toLowerCase();
                return hay.includes(ql);
              })
              .slice(0, 8);
          }
        }

        if (isProfesor && user) {
          const myCoursesRes = await supabase.from("courses").select("id").eq("teacher_id", user.id).limit(200);
          const ids = Array.from(new Set((myCoursesRes.data ?? []).map((x) => (x as { id: number }).id).filter((x) => Number.isFinite(x))));
          if (ids.length) {
            const reqRes = await supabase
              .from("course_resource_requests")
              .select("id,course_id,student_id,status,resource_type,requested_amount,created_at")
              .in("course_id", ids)
              .order("created_at", { ascending: false })
              .limit(80);
            if (!reqRes.error) {
              const rows = (reqRes.data ?? []) as RequestHit[];
              const ql = query.toLowerCase();
              requestHits = rows
                .filter((r) => {
                  const hay = `${r.id} ${r.course_id} ${r.student_id} ${r.status} ${r.resource_type} ${r.requested_amount}`.toLowerCase();
                  return hay.includes(ql);
                })
                .slice(0, 8);
            }
          }
        }

        if (isAudit) {
          const res = await supabase.from("audit_logs").select("action,entity_table,created_at").order("created_at", { ascending: false }).limit(200);
          if (!res.error) {
            const rows = (res.data ?? []) as Array<{ action: string; entity_table: string | null }>;
            const ql = query.toLowerCase();
            const uniq = new Map<string, AuditActionHit>();
            for (const r of rows) {
              const a = r.action ?? "";
              const t = r.entity_table ?? "";
              const hay = `${a} ${t}`.toLowerCase();
              if (!hay.includes(ql)) continue;
              const key = `${a}::${t}`;
              if (!uniq.has(key)) uniq.set(key, { action: a, entity_table: r.entity_table ?? null });
              if (uniq.size >= 8) break;
            }
            auditActionHits = Array.from(uniq.values());
          }
        }

        if (!cancelled) {
          setCourses(hits);
          setUsers(userHits);
          setRequests(requestHits);
          setAuditActions(auditActionHits);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 220);

    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [open, q, supabase, isAdmin, isAudit, isProfesor]);

  const go = (href: string) => {
    setOpen(false);
    setQ("");
    setCourses([]);
    setUsers([]);
    setRequests([]);
    setAuditActions([]);
    router.push(href);
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) {
          setQ("");
          setCourses([]);
          setUsers([]);
          setRequests([]);
          setAuditActions([]);
        }
      }}
      contentClassName="max-w-2xl"
    >
      <CommandInput
        placeholder={loading ? "Caut..." : "Cauta cursuri, pagini, actiuni..."}
        value={q}
        onValueChange={setQ}
      />
      <CommandList>
        <CommandEmpty>Niciun rezultat.</CommandEmpty>

        <CommandGroup heading="Navigare">
          <CommandItem value="acasa" onSelect={() => go("/")}>
            Acasa
          </CommandItem>

          {isAuthenticated ? (
            <>
              <CommandItem value="student" onSelect={() => go("/student")}>
                Student
              </CommandItem>
            </>
          ) : (
            <>
              <CommandItem value="login" onSelect={() => go("/login")}>
                Logare
              </CommandItem>
              <CommandItem value="register" onSelect={() => go("/register")}>
                Inregistrare
              </CommandItem>
            </>
          )}

          {isAdmin ? (
            <>
              <CommandSeparator />
              <CommandItem value="admin" onSelect={() => go("/admin")}>
                Admin dashboard
              </CommandItem>
              <CommandItem value="admin-roles" onSelect={() => go("/admin/roles")}>
                Admin · Roluri
              </CommandItem>
              <CommandItem value="admin-resurse" onSelect={() => go("/admin/resurse")}>
                Admin · Resurse
              </CommandItem>
              <CommandItem value="admin-statistici" onSelect={() => go("/admin/statistici")}>
                Admin · Statistici
              </CommandItem>
              <CommandItem value="admin-outbox" onSelect={() => go("/admin/outbox")}>
                Admin · Outbox
              </CommandItem>
            </>
          ) : null}

          {isProfesor ? (
            <>
              <CommandSeparator />
              <CommandItem value="profesor" onSelect={() => go("/profesor/cursuri")}>
                Profesor · Cursuri
              </CommandItem>
            </>
          ) : null}

          {isAudit ? (
            <>
              <CommandSeparator />
              <CommandItem value="audit" onSelect={() => go("/audit")}>
                Audit · Jurnal
              </CommandItem>
            </>
          ) : null}
        </CommandGroup>

        {courses.length ? (
          <>
            <CommandSeparator />
            <CommandGroup heading={isAdmin || isAudit ? "Cursuri (toate)" : isProfesor ? "Cursurile mele" : "Cursuri"}>
              {courses.map((c) => (
                <CommandItem key={c.id} value={`course-${c.id}-${c.title}`} onSelect={() => go(`/cursuri/${c.id}`)}>
                  {c.title}
                  <span className="ml-auto font-mono text-xs text-muted-foreground">#{c.id}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        ) : null}

        {isAdmin && users.length ? (
          <>
            <CommandSeparator />
            <CommandGroup heading="Utilizatori">
              {users.map((u) => {
                const label = u.full_name?.trim() || u.email || u.id;
                const shortId = u.id ? `${u.id.slice(0, 8)}…${u.id.slice(-4)}` : "";
                return (
                  <CommandItem key={u.id} value={`user-${u.id}-${label}`} onSelect={() => go("/admin/roles")}>
                    <span className="truncate">{label}</span>
                    <span className="ml-auto font-mono text-xs text-muted-foreground">{shortId}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </>
        ) : null}

        {(isAdmin || isProfesor) && requests.length ? (
          <>
            <CommandSeparator />
            <CommandGroup heading="Cereri resurse">
              {requests.map((r) => (
                <CommandItem
                  key={r.id}
                  value={`req-${r.id}-${r.course_id}-${r.status}-${r.resource_type}`}
                  onSelect={() => go(isAdmin ? "/admin/resurse" : `/profesor/cursuri/${r.course_id}`)}
                >
                  <span className="truncate">
                    #{r.id} · course#{r.course_id} · {r.resource_type} · {r.requested_amount} · {r.status}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        ) : null}

        {isAudit && auditActions.length ? (
          <>
            <CommandSeparator />
            <CommandGroup heading="Audit actions">
              {auditActions.map((a) => (
                <CommandItem
                  key={`${a.action}-${a.entity_table ?? "n/a"}`}
                  value={`audit-${a.action}-${a.entity_table ?? "n/a"}`}
                  onSelect={() => go("/audit")}
                >
                  <span className="truncate">
                    {a.action}
                    {a.entity_table ? ` · ${a.entity_table}` : ""}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        ) : null}
      </CommandList>
    </CommandDialog>
  );
}

