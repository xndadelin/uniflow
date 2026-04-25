"use client";

import { Toaster as Sonner } from "sonner";

export function Toaster() {
  return (
    <Sonner
      theme="dark"
      richColors
      closeButton
      position="top-right"
      toastOptions={{
        classNames: {
          toast: "border border-border bg-card text-foreground",
          title: "font-semibold",
          description: "text-muted-foreground",
        },
      }}
    />
  );
}
