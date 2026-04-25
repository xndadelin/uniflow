"use client";

import * as React from "react";
import {
  ResponsiveContainer,
  Tooltip,
  Legend,
  Tooltip as RechartsTooltip,
  Legend as RechartsLegend,
} from "recharts";

import { cn } from "@/lib/utils";

export type ChartConfig = Record<
  string,
  {
    label?: string;
    color?: string;
  }
>;

const ChartContext = React.createContext<ChartConfig | null>(null);

function useChart() {
  const ctx = React.useContext(ChartContext);
  if (!ctx) throw new Error("Chart components must be used within ChartContainer");
  return ctx;
}

export function ChartContainer({
  className,
  children,
  config,
  aspect = "auto",
}: {
  className?: string;
  children: React.ReactNode;
  config: ChartConfig;
  aspect?: "auto" | "square" | "video";
}) {
  const style = Object.fromEntries(
    Object.entries(config)
      .filter(([, v]) => Boolean(v?.color))
      .map(([k, v]) => [`--color-${k}`, v.color as string]),
  ) as React.CSSProperties;

  return (
    <div
      className={cn(
        "w-full",
        aspect === "square" ? "aspect-square" : aspect === "video" ? "aspect-video" : "",
        className,
      )}
      style={style}
    >
      <ResponsiveContainer width="100%" height="100%">
        <ChartContext.Provider value={config}>{children as React.ReactElement}</ChartContext.Provider>
      </ResponsiveContainer>
    </div>
  );
}

export function ChartTooltip(props: React.ComponentProps<typeof Tooltip>) {
  return (
    <RechartsTooltip
      {...props}
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

export function ChartLegend(props: React.ComponentProps<typeof Legend>) {
  return (
    <RechartsLegend
      {...props}
      wrapperStyle={{
        fontSize: 12,
        color: "hsl(var(--muted-foreground))",
      }}
    />
  );
}

export function ChartTooltipContent({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number | string; dataKey?: string; color?: string }>;
  label?: string;
}) {
  const config = useChart();
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-lg border border-border/60 bg-card px-3 py-2 text-xs shadow-sm">
      {label ? <div className="mb-1 text-muted-foreground">{label}</div> : null}
      <div className="space-y-1">
        {payload.map((p, idx) => {
          const key = String(p.dataKey ?? p.name ?? idx);
          const c = config[key];
          const color = c?.color ?? p.color ?? "hsl(var(--foreground))";
          return (
            <div key={key} className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2 text-muted-foreground">
                <span className="h-2 w-2 rounded-full" style={{ background: color }} />
                <span className="truncate">{c?.label ?? p.name ?? key}</span>
              </div>
              <div className="font-mono text-foreground">{String(p.value ?? "")}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ChartLegendContent({
  payload,
}: {
  payload?: Array<{ dataKey?: string; value?: string; color?: string }>;
}) {
  const config = useChart();
  if (!payload?.length) return null;

  return (
    <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
      {payload.map((p, idx) => {
        const key = String(p.dataKey ?? p.value ?? idx);
        const c = config[key];
        const color = c?.color ?? p.color ?? "hsl(var(--foreground))";
        return (
          <div key={key} className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full" style={{ background: color }} />
            <span>{c?.label ?? p.value ?? key}</span>
          </div>
        );
      })}
    </div>
  );
}

