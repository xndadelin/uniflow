"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";

export type PaginationProps = {
  page: number; // 1-based
  pageSize: number;
  totalItems: number;
  variant?: "default" | "compact";
  pageSizeOptions?: number[];
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  className?: string;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export function Pagination({
  page,
  pageSize,
  totalItems,
  variant = "default",
  pageSizeOptions = [10, 25, 50],
  onPageChange,
  onPageSizeChange,
  className,
}: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(Math.max(0, totalItems) / Math.max(1, pageSize)));
  const safePage = clamp(page, 1, totalPages);
  const start = totalItems === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const end = totalItems === 0 ? 0 : Math.min(totalItems, safePage * pageSize);

  return (
    <div
      className={[
        variant === "compact"
          ? "flex flex-wrap items-center justify-between gap-2"
          : "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {variant === "compact" ? (
        <div className="text-[11px] text-muted-foreground">
          {totalItems === 0 ? (
            <>0</>
          ) : (
            <>
              <span className="tabular-nums">{start}</span>–<span className="tabular-nums">{end}</span> /{" "}
              <span className="tabular-nums">{totalItems}</span>
            </>
          )}
        </div>
      ) : (
        <div className="text-xs text-muted-foreground">
          {totalItems === 0 ? (
            <>0 rezultate</>
          ) : (
            <>
              {start}–{end} din <span className="tabular-nums">{totalItems}</span>
            </>
          )}
        </div>
      )}

      <div className={["flex flex-wrap items-center", variant === "compact" ? "gap-1.5" : "gap-2"].join(" ")}>
        {variant !== "compact" && onPageSizeChange ? (
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            / pagină
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="h-9 rounded-md border border-input/60 bg-card px-2 text-sm text-foreground outline-none focus:border-ring"
            >
              {pageSizeOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {variant !== "compact" ? (
          <Button variant="outline" size="sm" onClick={() => onPageChange(1)} disabled={safePage <= 1}>
            Prima
          </Button>
        ) : null}

        <Button variant="outline" size="sm" onClick={() => onPageChange(safePage - 1)} disabled={safePage <= 1}>
          Înapoi
        </Button>

        <div className={variant === "compact" ? "px-1 text-[11px] text-muted-foreground" : "px-1 text-xs text-muted-foreground"}>
          <span className="tabular-nums text-foreground">{safePage}</span> / <span className="tabular-nums">{totalPages}</span>
        </div>

        <Button variant="outline" size="sm" onClick={() => onPageChange(safePage + 1)} disabled={safePage >= totalPages}>
          Înainte
        </Button>

        {variant !== "compact" ? (
          <Button variant="outline" size="sm" onClick={() => onPageChange(totalPages)} disabled={safePage >= totalPages}>
            Ultima
          </Button>
        ) : null}
      </div>
    </div>
  );
}

