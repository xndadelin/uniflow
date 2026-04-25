import Link from "next/link";

export default function Home() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <section className="w-full max-w-3xl bg-card p-8 md:p-10">
        <p className="mb-3 font-mono text-xs uppercase tracking-[0.24em] text-primary">UniFlow</p>
        <h1 className="mb-3 font-mono text-3xl font-semibold tracking-wider text-foreground md:text-4xl">
          Auth Gateway
        </h1>
        <p className="mb-8 max-w-2xl text-sm text-muted-foreground md:text-base">
          Intră în platformă cu email + parolă sau prin GitHub OAuth.
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <Link
            href="/login"
            className="inline-flex items-center justify-center bg-primary px-4 py-2 text-sm font-semibold uppercase tracking-wide text-primary-foreground transition hover:opacity-90"
          >
            Login
          </Link>
          <Link
            href="/register"
            className="inline-flex items-center justify-center bg-muted/30 px-4 py-2 text-sm font-semibold uppercase tracking-wide text-foreground transition hover:bg-muted/50"
          >
            Register
          </Link>
        </div>
      </section>
    </main>
  );
}
