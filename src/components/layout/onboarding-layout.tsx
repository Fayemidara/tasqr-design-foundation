import { ReactNode } from "react";

export function OnboardingLayout({
  step,
  totalSteps,
  children,
  maxWidth = 600,
  bare = false,
}: {
  step: number;
  totalSteps: number;
  children: ReactNode;
  maxWidth?: number;
  bare?: boolean;
}) {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="h-[60px] bg-sidebar flex items-center px-4 sm:px-6 border-b border-border">
        <span className="font-mono text-lg font-semibold tracking-tight text-sidebar-foreground">
          TASQR
        </span>
      </header>
      <main className="flex-1 flex flex-col items-center px-4 py-6 sm:py-10">
        <div className="w-full" style={{ maxWidth }}>
          <div className="mb-6 flex items-center gap-3">
            <div className="font-mono text-[11px] uppercase tracking-[0.05em] text-muted-foreground">
              Step {step} of {totalSteps}
            </div>
            <div className="flex-1 h-1 bg-border rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${(step / totalSteps) * 100}%` }}
              />
            </div>
          </div>
          {bare ? (
            children
          ) : (
            <div className="bg-surface-raised border border-border rounded-[4px] p-4 sm:p-6">
              {children}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
