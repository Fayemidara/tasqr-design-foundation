import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/app-shell";
import { RequireAuth } from "@/components/auth/require-auth";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/profile")({
  head: () => ({ meta: [{ title: "Profile — Tasqr" }] }),
  component: () => (
    <RequireAuth>
      <AppShell>
        <ProfileBody />
      </AppShell>
    </RequireAuth>
  ),
});

function ProfileBody() {
  const { user } = useAuth();
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10 space-y-2">
      <div className="text-label">Account</div>
      <h1 className="font-mono text-[32px]">Profile</h1>
      <p className="text-sm text-muted-foreground">{user?.email}</p>
    </div>
  );
}
