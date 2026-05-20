import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/app-shell";
import { RequireAuth } from "@/components/auth/require-auth";

export const Route = createFileRoute("/browse")({
  head: () => ({ meta: [{ title: "Browse — Tasqr" }] }),
  component: () => (
    <RequireAuth>
      <AppShell>
        <div className="max-w-6xl mx-auto px-8 py-10 space-y-2">
          <div className="text-label">Marketplace</div>
          <h1 className="font-mono text-[32px]">Browse</h1>
          <p className="text-sm text-muted-foreground">No agents yet.</p>
        </div>
      </AppShell>
    </RequireAuth>
  ),
});
