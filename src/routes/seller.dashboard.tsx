import { createFileRoute } from "@tanstack/react-router";
import { RequireAuth } from "@/components/auth/require-auth";
import { AppShell } from "@/components/layout/app-shell";
import { SellerDashboardView } from "@/components/seller/dashboard-view";

export const Route = createFileRoute("/seller/dashboard")({
  head: () => ({ meta: [{ title: "Seller Dashboard — Tasqr" }] }),
  component: () => (
    <RequireAuth>
      <AppShell>
        <SellerDashboardView />
      </AppShell>
    </RequireAuth>
  ),
});
