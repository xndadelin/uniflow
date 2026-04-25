import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function Loading() {
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-4 py-10 md:px-6 md:py-12">
      <header className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="h-3 w-20 animate-pulse rounded bg-muted/40" />
          <div className="mt-3 h-8 w-96 max-w-full animate-pulse rounded bg-muted/35" />
          <div className="mt-3 h-4 w-[620px] max-w-full animate-pulse rounded bg-muted/25" />
        </div>
        <div className="flex gap-2">
          <div className="h-9 w-40 animate-pulse rounded-md bg-muted/35" />
          <div className="h-9 w-44 animate-pulse rounded-md bg-muted/35" />
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[360px_1fr] lg:items-start">
        <Card className="lg:sticky lg:top-20">
          <CardHeader className="space-y-2">
            <CardTitle className="text-base font-semibold tracking-tight">Detalii</CardTitle>
            <div className="h-3 w-48 animate-pulse rounded bg-muted/25" />
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="space-y-2">
              <div className="h-3 w-16 animate-pulse rounded bg-muted/25" />
              <div className="h-4 w-24 animate-pulse rounded bg-muted/40" />
            </div>
            <div className="space-y-2">
              <div className="h-3 w-16 animate-pulse rounded bg-muted/25" />
              <div className="h-4 w-40 animate-pulse rounded bg-muted/40" />
            </div>
            <div className="h-9 w-full animate-pulse rounded-md bg-muted/35" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="space-y-2">
            <CardTitle className="text-base font-semibold tracking-tight">Preview</CardTitle>
            <div className="h-3 w-[520px] max-w-full animate-pulse rounded bg-muted/25" />
          </CardHeader>
          <CardContent>
            <div className="h-[70vh] w-full animate-pulse rounded-md bg-muted/25 md:h-[78vh]" />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

