import { ReactNode } from "react";

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4 py-10">
      <div className="font-mono text-lg font-semibold tracking-tight text-foreground mb-6">
        TASQR
      </div>
      <div className="w-full max-w-[400px] bg-surface-raised border border-border rounded-[4px] p-6">
        {children}
      </div>
    </div>
  );
}
