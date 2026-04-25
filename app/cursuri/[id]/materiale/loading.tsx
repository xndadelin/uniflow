import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function Loading() {
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-4 py-10 md:px-6 md:py-12">
      <header className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="h-3 w-20 animate-pulse rounded bg-muted/40" />
          <div className="mt-3 h-8 w-80 max-w-full animate-pulse rounded bg-muted/35" />
          <div className="mt-3 h-4 w-[520px] max-w-full animate-pulse rounded bg-muted/25" />
        </div>
        <div className="h-9 w-36 animate-pulse rounded-md bg-muted/35" />
      </header>

      <Card>
        <CardHeader className="space-y-2">
          <CardTitle className="text-base font-semibold tracking-tight">Lista materiale</CardTitle>
          <div className="h-3 w-72 animate-pulse rounded bg-muted/25" />
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
              <div className="space-y-2">
                <div className="h-4 w-24 animate-pulse rounded bg-muted/60" />
                <div className="h-9 w-full animate-pulse rounded-md bg-muted/40" />
              </div>
              <div className="h-9 w-40 animate-pulse rounded-md bg-muted/40 sm:ml-auto" />
            </div>

            <div className="overflow-hidden rounded-md border border-border/60 bg-muted/15 divide-y divide-border/30">
              {Array.from({ length: 6 }).map((_, idx) => (
                <div key={idx} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="h-4 w-2/3 animate-pulse rounded bg-muted/50" />
                      <div className="h-3 w-5/6 animate-pulse rounded bg-muted/30" />
                      <div className="h-3 w-24 animate-pulse rounded bg-muted/25" />
                    </div>
                    <div className="h-4 w-14 animate-pulse rounded bg-muted/25" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}

