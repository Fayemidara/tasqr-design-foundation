import { createFileRoute } from "@tanstack/react-router";
import { RequireAuth } from "@/components/auth/require-auth";
import { AppShell } from "@/components/layout/app-shell";

export const Route = createFileRoute("/seller/earnings")({
  head: () => ({ meta: [{ title: "Earnings — Tasqr" }] }),
  component: () => (
    <RequireAuth>
      <AppShell>
        <div className="max-w-4xl mx-auto px-8 py-10">
          <h1 className="font-mono text-[32px] mb-2">Earnings</h1>
          <p className="text-muted-foreground text-sm">Coming soon.</p>
        </div>
      </AppShell>
    </RequireAuth>
  ),
});
