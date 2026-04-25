"use client";

import * as React from "react";
import {
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  Legend as RechartsLegend,
} from "recharts";

import { cn } from "@/lib/utils";

export function ChartContainer({
  className,
  children,
  aspect = "auto",
}: {
  className?: string;
  children: React.ReactNode;
  aspect?: "auto" | "square" | "video";
}) {
  return (
    <div
      className={cn(
        "w-full",
        aspect === "square" ? "aspect-square" : aspect === "video" ? "aspect-video" : "",
        className,
      )}
    >
      <ResponsiveContainer width="100%" height="100%">
        {children as React.ReactElement}
      </ResponsiveContainer>
    </div>
  );
}

export function ChartTooltip(props: Record<string, unknown>) {
  return (
    <RechartsTooltip
      {...(props as Record<string, unknown>)}
      contentStyle={{
        background: "hsl(var(--card))",
        border: "1px solid hsl(var(--border))",
        borderRadius: 8,
        color: "hsl(var(--foreground))",
        fontSize: 12,
      }}
      labelStyle={{ color: "hsl(var(--muted-foreground))" }}
      itemStyle={{ color: "hsl(var(--foreground))" }}
      cursor={{ fill: "hsl(var(--muted))", opacity: 0.25 }}
    />
  );
}

export function ChartLegend(props: Record<string, unknown>) {
  return (
    <RechartsLegend
      {...(props as Record<string, unknown>)}
      wrapperStyle={{
        fontSize: 12,
        color: "hsl(var(--muted-foreground))",
      }}
    />
  );
}

