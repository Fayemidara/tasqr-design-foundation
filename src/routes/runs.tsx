import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/app-shell";
import { RequireAuth } from "@/components/auth/require-auth";

export const Route = createFileRoute("/runs")({
  head: () => ({ meta: [{ title: "My Runs — Tasqr" }] }),
  component: () => (
    <RequireAuth>
      <AppShell>
        <div className="max-w-6xl mx-auto px-8 py-10 space-y-2">
          <div className="text-label">Activity</div>
          <h1 className="font-mono text-[32px]">My Runs</h1>
          <p className="text-sm text-muted-foreground">No runs yet.</p>
        </div>
      </AppShell>
    </RequireAuth>
  ),
});
