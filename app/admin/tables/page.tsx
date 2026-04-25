"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type AppUserRow = {
  id: string;
  email: string;
  full_name: string | null;
  created_at: string;
};

export default function AdminTablesPage() {
  const supabase = useMemo(() => createClient(), []);
  const [query, setQuery] = useState("");

  const adminCheckQuery = useQuery({
    queryKey: ["admin-check"],
    queryFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        return { isAdmin: false, isAuthenticated: false };
      }

      const { data, error } = await supabase.rpc("is_admin", { _user_id: user.id });
      if (error) throw error;

      return { isAdmin: Boolean(data), isAuthenticated: true };
    },
  });

  const usersQuery = useQuery({
    queryKey: ["admin-table-app-users"],
    enabled: adminCheckQuery.data?.isAdmin === true,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("app_users")
        .select("id,email,full_name,created_at")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data ?? []) as AppUserRow[];
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
          <Link href="/login" className="mt-4 inline-flex bg-primary px-4 py-2 text-xs font-semibold uppercase tracking-wide text-primary-foreground">
            Mergi la logare
          </Link>
        </section>
      </main>
    );
  }

  if (!adminCheckQuery.data?.isAdmin) {
    return (
      <main className="flex min-h-[70vh] items-center justify-center px-4 py-8">
        <section className="w-full max-w-md bg-card p-6">
          <h1 className="font-mono text-xl font-semibold text-foreground">Acces interzis</h1>
          <p className="mt-2 text-sm text-muted-foreground">Doar utilizatorii cu rol admin pot vedea tabelele admin.</p>
          <Link href="/" className="mt-4 inline-flex bg-primary px-4 py-2 text-xs font-semibold uppercase tracking-wide text-primary-foreground">
            Inapoi acasa
          </Link>
        </section>
      </main>
    );
  }

  const users = usersQuery.data ?? [];
  const q = query.trim().toLowerCase();
  const filtered = q
    ? users.filter((u) => (u.email ?? "").toLowerCase().includes(q) || (u.full_name ?? "").toLowerCase().includes(q) || u.id.toLowerCase().includes(q))
    : users;

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-8">
      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.24em] text-primary">Admin</p>
          <h1 className="mt-2 font-mono text-2xl font-semibold tracking-wider text-foreground">Tabele</h1>
          <p className="mt-1 text-sm text-muted-foreground">Vizualizare rapida a datelor in format shadcn table.</p>
        </div>

        <div className="w-full max-w-sm">
          <label className="sr-only" htmlFor="admin-users-search">
            Cauta utilizatori
          </label>
          <input
            id="admin-users-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cauta dupa nume, email, id..."
            className="w-full border border-input/60 bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-ring"
          />
        </div>
      </header>

      <section className="bg-card p-4 md:p-6">
        {usersQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Se incarca datele...</p>
        ) : usersQuery.isError ? (
          <p className="text-sm text-destructive">A aparut o eroare la incarcarea utilizatorilor.</p>
        ) : (
          <Table>
            <TableCaption>{filtered.length} utilizatori (din {users.length}).</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Nume</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>ID</TableHead>
                <TableHead className="text-right">Creat la</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-10 text-center text-sm text-muted-foreground">
                    Niciun rezultat.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium text-foreground">{u.full_name || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{u.email}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{u.id}</TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">
                      {new Date(u.created_at).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        )}
      </section>
    </main>
  );
}

