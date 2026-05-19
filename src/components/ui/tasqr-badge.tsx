import * as React from "react";
import { cn } from "@/lib/utils";

type Variant =
  | "category"
  | "reliability-high"
  | "status-live"
  | "status-paused"
  | "status-review";

const variants: Record<Variant, string> = {
  category: "bg-sidebar text-sidebar-foreground",
  "reliability-high": "bg-warning text-warning-foreground",
  "status-live": "bg-[oklch(0.65_0.17_155)] text-background",
  "status-paused": "bg-warning text-warning-foreground",
  "status-review": "bg-destructive text-destructive-foreground",
};

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: Variant;
}

export function Badge({ className, variant = "category", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center font-mono text-[11px] font-medium uppercase tracking-[0.05em] px-2 py-0.5 rounded-[4px]",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}
