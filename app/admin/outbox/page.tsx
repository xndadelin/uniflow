"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/utils/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Pagination } from "@/components/Pagination";

type OutboxRow = {
  id: number;
  to_email: string;
  subject: string;
  body: string;
  created_at: string;
  sent_at: string | null;
};

function getErrorMessage(err: unknown) {
  if (!err) return "Eroare necunoscuta.";
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && "message" in err && typeof (err as { message?: unknown }).message === "string") return (err as { message: string }).message;
  return "Eroare la request.";
}

export default function AdminOutboxPage() {
  const supabase = useMemo(() => createClient(), []);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | "sent" | "pending">("all");
  const pageSize = 25;

  const adminCheckQuery = useQuery({
    queryKey: ["admin-check"],
    queryFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return { isAdmin: false, isAuthenticated: false };
      const { data, error } = await supabase.rpc("is_admin", { _user_id: user.id });
      if (error) throw error;
      return { isAdmin: Boolean(data), isAuthenticated: true };
    },
  });

  const dataQuery = useQuery({
    queryKey: ["admin-outbox", { page, search, status }],
    enabled: adminCheckQuery.data?.isAdmin === true,
    queryFn: async () => {
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      const q = search.trim().toLowerCase();

      let query = supabase
        .from("email_outbox")
        .select("id,to_email,subject,body,created_at,sent_at", { count: "exact" })
        .order("created_at", { ascending: false });

      if (status === "sent") query = query.not("sent_at", "is", null);
      if (status === "pending") query = query.is("sent_at", null);
      if (q) query = query.or(`to_email.ilike.%${q}%,subject.ilike.%${q}%`);

      const res = await query.range(from, to);
      if (res.error) throw res.error;

      return { rows: (res.data ?? []) as OutboxRow[], total: res.count ?? 0 };
    },
  });

  if (adminCheckQuery.isLoading) {
    return (
      <main className="flex min-h-[70vh] items-center justify-center px-4 py-8">
        <section className="w-full max-w-md bg-card p-6 text-sm text-muted-foreground">Se verifica accesul...</section>
      </main>
    );
  }

  if (!adminCheckQuery.data?.isAuthenticated) {
    return (
      <main className="flex min-h-[70vh] items-center justify-center px-4 py-8">
        <section className="w-full max-w-md bg-card p-6">
          <h1 className="font-mono text-xl font-semibold text-foreground">Acces restrictionat</h1>
          <p className="mt-2 text-sm text-muted-foreground">Trebuie sa fii autentificat pentru aceasta pagina.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button asChild size="sm">
              <Link href="/login">Logare</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/register">Inregistrare</Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link href="/">Inapoi acasa</Link>
            </Button>
          </div>
        </section>
      </main>
    );
  }

  if (!adminCheckQuery.data?.isAdmin) {
    return (
      <main className="flex min-h-[70vh] items-center justify-center px-4 py-8">
        <section className="w-full max-w-md bg-card p-6">
          <h1 className="font-mono text-xl font-semibold text-foreground">Acces interzis</h1>
          <p className="mt-2 text-sm text-muted-foreground">Doar admin poate vedea email outbox.</p>
          <Button asChild size="sm" className="mt-4">
            <Link href="/">Inapoi acasa</Link>
          </Button>
        </section>
      </main>
    );
  }

  const rows = dataQuery.data?.rows ?? [];
  const total = dataQuery.data?.total ?? 0;

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-10 pb-14 md:px-6">
      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">Admin</p>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">Outbox</h1>
          <p className="text-sm text-muted-foreground">Emailuri generate pentru distribuirea credențialelor (simulat).</p>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link href="/admin">Inapoi</Link>
        </Button>
      </header>

      <Card className="shadow-sm">
        <CardHeader className="space-y-3 pb-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="text-xs text-muted-foreground">
              Total: <span className="font-mono text-foreground">{total}</span>
            </div>
            <Pagination variant="compact" page={page} pageSize={pageSize} totalItems={total} onPageChange={setPage} />
          </div>
          <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
            <div className="space-y-1">
              <Label className="text-xs" htmlFor="outbox-search">
                Cauta (to/subject)
              </Label>
              <Input
                id="outbox-search"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="ex: student@ / VPS / parola..."
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Status</Label>
              <div className="grid grid-cols-3 gap-2 rounded-md bg-muted/10 p-1">
                {(
                  [
                    ["all", "Toate"],
                    ["pending", "Pending"],
                    ["sent", "Sent"],
                  ] as const
                ).map(([k, label]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => {
                      setStatus(k);
                      setPage(1);
                    }}
                    className={[
                      "h-9 rounded-md px-2 text-xs font-medium transition",
                      status === k ? "bg-card shadow-2xs text-foreground" : "text-muted-foreground hover:text-foreground",
                    ].join(" ")}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0 pb-2">
          {dataQuery.isLoading ? (
            <div className="px-5 pb-5 text-sm text-muted-foreground">Se incarca...</div>
          ) : dataQuery.isError ? (
            <div className="px-5 pb-5 text-sm text-destructive">Eroare: {getErrorMessage(dataQuery.error)}</div>
          ) : rows.length === 0 ? (
            <div className="px-5 pb-5 text-sm text-muted-foreground">Nu exista emailuri in outbox.</div>
          ) : (
            <div className="overflow-hidden border-t border-border/60 pt-2">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="px-5 py-4">Catre</TableHead>
                    <TableHead className="px-5 py-4">Subiect</TableHead>
                    <TableHead className="px-5 py-4">Status</TableHead>
                    <TableHead className="px-5 py-4 text-right">Creat</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.id} className="hover:bg-muted/20">
                      <TableCell className="px-5 py-4 text-sm text-foreground">{r.to_email}</TableCell>
                      <TableCell className="px-5 py-4">
                        <div className="space-y-1">
                          <div className="text-sm font-medium text-foreground">{r.subject}</div>
                          <div className="line-clamp-1 text-xs text-muted-foreground">{r.body}</div>
                        </div>
                      </TableCell>
                      <TableCell className="px-5 py-4">
                        {r.sent_at ? <Badge variant="secondary">sent</Badge> : <Badge variant="outline">pending</Badge>}
                      </TableCell>
                      <TableCell className="px-5 py-4 text-right text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(r.created_at).toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}

