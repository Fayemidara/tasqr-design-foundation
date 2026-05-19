import * as React from "react";
import { cn } from "@/lib/utils";

export const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "bg-surface-raised border border-border rounded-[4px] p-4",
        className,
      )}
      {...props}
    />
  ),
);
Card.displayName = "Card";
