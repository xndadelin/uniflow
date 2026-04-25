"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/utils/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pagination } from "@/components/Pagination";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type AppUser = {
  id: string;
  email: string;
  full_name: string | null;
  created_at: string;
};

type Role = {
  id: number;
  name: string;
  description: string | null;
};

type UserRole = {
  user_id: string;
  role_id: number;
};

export default function AdminRolesPage() {
  const supabase = useMemo(() => createClient(), []);
  const [selectedRoleByUser, setSelectedRoleByUser] = useState<Record<string, number>>({});
  const [usersPage, setUsersPage] = useState<number>(1);
  const [usersPageSize, setUsersPageSize] = useState<number>(10);

  async function signOut() {
    await fetch("/api/auth/signout", { method: "POST" });
    window.location.href = "/login";
  }

  const adminCheckQuery = useQuery({
    queryKey: ["admin-check"],
    queryFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        return { isAdmin: false, isAuthenticated: false, userId: null as string | null };
      }

      const { data, error } = await supabase.rpc("is_admin", { _user_id: user.id });

      if (error) {
        throw error;
      }

      return { isAdmin: Boolean(data), isAuthenticated: true, userId: user.id };
    },
  });

  const rolesDataQuery = useQuery({
    queryKey: ["admin-roles-data", { usersPage, usersPageSize }],
    enabled: adminCheckQuery.data?.isAdmin === true,
    queryFn: async () => {
      const from = (usersPage - 1) * usersPageSize;
      const to = from + usersPageSize - 1;
      const [usersRes, rolesRes, userRolesRes] = await Promise.all([
        supabase
          .from("app_users")
          .select("id,email,full_name,created_at", { count: "exact" })
          .order("created_at", { ascending: false })
          .range(from, to),
        supabase.from("roles").select("id,name,description").order("name", { ascending: true }),
        supabase.from("user_roles").select("user_id,role_id"),
      ]);

      if (usersRes.error) throw usersRes.error;
      if (rolesRes.error) throw rolesRes.error;
      if (userRolesRes.error) throw userRolesRes.error;

      return {
        users: (usersRes.data ?? []) as AppUser[],
        usersCount: usersRes.count ?? 0,
        roles: (rolesRes.data ?? []) as Role[],
        userRoles: (userRolesRes.data ?? []) as UserRole[],
      };
    },
  });

  const mutateRoles = useMutation({
    mutationFn: async ({ action, userId, roleId }: { action: "assign" | "replace" | "revoke"; userId: string; roleId: number }) => {
      if (action === "assign") {
        const { error } = await supabase.from("user_roles").insert({ user_id: userId, role_id: roleId });
        if (error) throw error;
        return;
      }

      if (action === "replace") {
        const { error: deleteError } = await supabase.from("user_roles").delete().eq("user_id", userId);
        if (deleteError) throw deleteError;

        const { error: insertError } = await supabase.from("user_roles").insert({ user_id: userId, role_id: roleId });
        if (insertError) throw insertError;
        return;
      }

      const { error } = await supabase
        .from("user_roles")
        .delete()
        .eq("user_id", userId)
        .eq("role_id", roleId);

      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      const labels: Record<typeof variables.action, string> = {
        assign: "Rol atribuit cu succes.",
        replace: "Rolul a fost modificat.",
        revoke: "Rol revocat cu succes.",
      };
      toast.success(labels[variables.action]);
      void rolesDataQuery.refetch();
    },
    onError: (error: Error) => {
      toast.error(error.message);
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
          <p className="mt-2 text-sm text-muted-foreground">Doar utilizatorii cu rol admin pot gestiona roluri.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={signOut}>
              Delogare
            </Button>
            <Button asChild size="sm">
              <Link href="/">Inapoi acasa</Link>
            </Button>
          </div>
        </section>
      </main>
    );
  }

  const users = rolesDataQuery.data?.users ?? [];
  const usersCount = rolesDataQuery.data?.usersCount ?? 0;
  const roles = rolesDataQuery.data?.roles ?? [];
  const userRoles = rolesDataQuery.data?.userRoles ?? [];

  const rolesByUser = userRoles.reduce<Record<string, number[]>>((acc, item) => {
    acc[item.user_id] = [...(acc[item.user_id] ?? []), item.role_id];
    return acc;
  }, {});

  const roleMap = new Map(roles.map((role) => [role.id, role]));

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-10 pb-14 md:px-6">
      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">Admin</p>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">Roluri</h1>
          <p className="text-sm text-muted-foreground">Atribuire, modificare și revocare roluri.</p>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link href="/admin">Inapoi</Link>
        </Button>
      </header>

      <Card className="shadow-sm">
        <CardHeader className="space-y-2 pb-4">
          <CardTitle className="text-base font-semibold tracking-tight">Utilizatori</CardTitle>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div className="text-xs text-muted-foreground">
              Total: <span className="font-mono text-foreground">{usersCount}</span>
            </div>
            <Pagination
              variant="compact"
              page={usersPage}
              pageSize={usersPageSize}
              totalItems={usersCount}
              onPageChange={(p) => setUsersPage(p)}
              onPageSizeChange={(s) => {
                setUsersPageSize(s);
                setUsersPage(1);
              }}
            />
          </div>
        </CardHeader>
        <CardContent className="p-0 pb-2">
        {rolesDataQuery.isLoading ? (
          <div className="px-5 pb-5 text-sm text-muted-foreground">Se incarca utilizatorii...</div>
        ) : (
          <>
            <div className="overflow-hidden border-t border-border/60 pt-2">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[64px] px-5 py-4 text-center">#</TableHead>
                    <TableHead className="px-5 py-4">Nume</TableHead>
                    <TableHead className="px-5 py-4">Email</TableHead>
                    <TableHead className="px-5 py-4">Roluri</TableHead>
                    <TableHead className="w-[280px] px-5 py-4">Actiuni</TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {users.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="py-12 text-center text-sm text-muted-foreground">
                        Nu exista utilizatori.
                      </TableCell>
                    </TableRow>
                  ) : (
                    users.map((user, idx) => {
                      const assignedRoleIds = rolesByUser[user.id] ?? [];
                      const selectedRole = selectedRoleByUser[user.id] ?? roles[0]?.id;

                      return (
                        <TableRow key={user.id} className="hover:bg-muted/20">
                          <TableCell className="px-5 py-4 text-center font-mono text-xs text-muted-foreground">
                            {(usersPage - 1) * usersPageSize + idx + 1}
                          </TableCell>

                          <TableCell className="min-w-[180px] px-5 py-4">
                            <div className="space-y-0.5">
                              <p className="text-sm font-medium text-foreground">{user.full_name || "—"}</p>
                              <p className="font-mono text-[11px] text-muted-foreground">{user.id}</p>
                            </div>
                          </TableCell>

                          <TableCell className="min-w-[220px] px-5 py-4 text-sm text-muted-foreground">{user.email}</TableCell>

                          <TableCell className="min-w-[260px] px-5 py-4">
                            <div className="flex flex-wrap gap-2">
                              {assignedRoleIds.length === 0 ? (
                                <span className="rounded-md bg-muted/30 px-2 py-1 text-xs text-muted-foreground">fara rol</span>
                              ) : (
                                assignedRoleIds.map((roleId) => {
                                  const role = roleMap.get(roleId);

                                  return (
                                    <button
                                      key={`${user.id}-${roleId}`}
                                      type="button"
                                      onClick={() => mutateRoles.mutate({ action: "revoke", userId: user.id, roleId })}
                                      disabled={mutateRoles.isPending}
                                      className="inline-flex items-center gap-1 rounded-md bg-muted/30 px-2 py-1 text-xs text-foreground transition hover:bg-muted/50 disabled:opacity-50"
                                      title="Click pentru revocare"
                                    >
                                      <span>{role?.name ?? `rol-${roleId}`}</span>
                                      <span className="text-muted-foreground">×</span>
                                    </button>
                                  );
                                })
                              )}
                            </div>
                          </TableCell>

                          <TableCell className="min-w-[280px] px-5 py-4">
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                              <select
                                value={selectedRole ?? ""}
                                onChange={(event) =>
                                  setSelectedRoleByUser((prev) => ({
                                    ...prev,
                                    [user.id]: Number(event.target.value),
                                  }))
                                }
                                className="h-10 w-full min-w-[160px] rounded-md border border-input/60 bg-card px-3 text-sm text-foreground outline-none focus:border-ring sm:w-auto"
                              >
                                {roles.map((role) => (
                                  <option key={role.id} value={role.id}>
                                    {role.name}
                                  </option>
                                ))}
                              </select>

                              <div className="flex gap-2">
                                <Button
                                  type="button"
                                  size="sm"
                                  disabled={mutateRoles.isPending || !selectedRole}
                                  onClick={() =>
                                    selectedRole &&
                                    mutateRoles.mutate({ action: "assign", userId: user.id, roleId: selectedRole })
                                  }
                                >
                                  Atribuie
                                </Button>

                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  disabled={mutateRoles.isPending || !selectedRole}
                                  onClick={() => {
                                    if (!selectedRole) return;
                                    const ok = window.confirm(
                                      "Modificare rol: aceasta actiune va sterge rolurile curente si va seta doar rolul selectat. Continui?"
                                    );
                                    if (!ok) return;
                                    mutateRoles.mutate({ action: "replace", userId: user.id, roleId: selectedRole });
                                  }}
                                >
                                  Modifica
                                </Button>
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </>
        )}
        </CardContent>
      </Card>
    </main>
  );
}
