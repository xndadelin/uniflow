import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/app/providers";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { AppTopNav } from "@/components/AppTopNav";

export const metadata: Metadata = {
  title: "UniFlow",
  description: "UniFlow authentication portal",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: isAdmin }, { data: isProfesor }] = user
    ? await Promise.all([
        supabase.rpc("is_admin", { _user_id: user.id }),
        supabase.rpc("is_profesor", { _user_id: user.id }),
      ])
    : [{ data: false }, { data: false }];

  const displayName =
    (user?.user_metadata?.full_name as string | undefined) ||
    (user?.user_metadata?.name as string | undefined) ||
    (user?.user_metadata?.user_name as string | undefined) ||
    user?.email?.split("@")[0] ||
    null;

  return (
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <body className="min-h-full flex flex-col bg-background font-sans text-foreground">
        <Providers>
          <AppTopNav
            displayName={displayName}
            isAuthenticated={Boolean(user)}
            isAdmin={Boolean(isAdmin)}
            isProfesor={Boolean(isProfesor)}
          />
          {children}
        </Providers>
      </body>
    </html>
  );
}
