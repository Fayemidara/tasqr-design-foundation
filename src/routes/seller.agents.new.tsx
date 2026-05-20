import { createFileRoute, Link } from "@tanstack/react-router";
import { RequireAuth, RequireSellerMode } from "@/components/auth/require-auth";
import { AppShell } from "@/components/layout/app-shell";

export const Route = createFileRoute("/seller/agents/new")({
  head: () => ({ meta: [{ title: "List New Agent — Tasqr" }] }),
  component: () => (
    <RequireAuth>
      <RequireSellerMode>
        <AppShell>
          <div className="max-w-4xl mx-auto px-8 py-10">
            <h1 className="font-mono text-[32px] mb-2">List a New Agent</h1>
            <p className="text-muted-foreground text-sm mb-6">
              Start the onboarding flow to add another agent.
            </p>
            <Link
              to="/seller/onboarding"
              className="inline-flex items-center h-10 px-4 rounded-[4px] bg-primary text-primary-foreground font-mono text-sm"
            >
              Start
            </Link>
          </div>
        </AppShell>
      </RequireSellerMode>
    </RequireAuth>
  ),
});
