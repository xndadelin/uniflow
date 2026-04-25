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

        if (!cancelled) setCourses(hits);
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
      </CommandList>
    </CommandDialog>
  );
}

