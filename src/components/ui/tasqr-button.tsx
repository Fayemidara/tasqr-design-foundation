import * as React from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "danger";
type Size = "sm" | "md";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const base =
  "inline-flex items-center justify-center font-mono font-medium rounded-[4px] transition-colors select-none active:translate-y-px disabled:opacity-50 disabled:cursor-not-allowed disabled:active:translate-y-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-10 px-4 text-sm",
};

const variants: Record<Variant, string> = {
  primary:
    "bg-primary text-primary-foreground hover:bg-[oklch(0.5_0.16_255)] disabled:hover:bg-primary",
  secondary:
    "bg-transparent border border-border text-foreground hover:bg-surface-raised",
  danger:
    "bg-destructive text-destructive-foreground hover:bg-[oklch(0.58_0.21_38)] disabled:hover:bg-destructive",
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", ...props }, ref) => (
    <button
      ref={ref}
      className={cn(base, sizes[size], variants[variant], className)}
      {...props}
    />
  ),
);
Button.displayName = "Button";
