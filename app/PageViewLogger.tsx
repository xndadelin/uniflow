"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";

export function PageViewLogger() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const lastLoggedRef = useRef<string | null>(null);

  useEffect(() => {
    const qs = searchParams?.toString();
    const page = `${pathname}${qs ? `?${qs}` : ""}`;

    if (!page) return;
    if (lastLoggedRef.current === page) return;
    lastLoggedRef.current = page;

    void fetch("/api/audit/view", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        page,
        details: {
          referrer: typeof document !== "undefined" ? document.referrer : null,
        },
      }),
    });
  }, [pathname, searchParams]);

  return null;
}

