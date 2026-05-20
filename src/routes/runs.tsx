import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/app-shell";
import { RequireAuth } from "@/components/auth/require-auth";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

type Row = {
  id: string;
  status: string;
  created_at: string;
  agent: { name: string; slug: string | null } | null;
};

const STATUS_STYLES: Record<string, string> = {
  success: "bg-success/15 text-success border-success/30",
  error: "bg-destructive/15 text-destructive border-destructive/30",
  timeout: "bg-destructive/15 text-destructive border-destructive/30",
  unreachable: "bg-destructive/15 text-destructive border-destructive/30",
  malformed: "bg-destructive/15 text-destructive border-destructive/30",
  processing: "bg-warning/15 text-warning border-warning/30",
  pending: "bg-warning/15 text-warning border-warning/30",
};

function StatusBadge({ status }: { status: string }) {
  const label = status.charAt(0).toUpperCase() + status.slice(1);
  return (
    <span
      className={cn(
        "font-mono text-[10px] uppercase tracking-[0.05em] px-2 py-0.5 rounded-[4px] border",
        STATUS_STYLES[status] ?? "bg-muted text-muted-foreground border-border",
      )}
    >
      {label}
    </span>
  );
}

function MyRuns() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("runs")
        .select("id,status,created_at,agent:agents(name,slug)")
        .eq("buyer_id", user.id)
        .order("created_at", { ascending: false });
      setRows((data as unknown as Row[]) ?? []);
    })();
  }, [user]);

  return (
    <div className="max-w-6xl mx-auto px-8 py-10 space-y-6">
      <div>
        <div className="font-mono text-[11px] uppercase tracking-[0.05em] text-muted-foreground">
          Activity
        </div>
        <h1 className="font-mono text-[32px]">My Runs</h1>
      </div>

      {rows === null && (
        <div className="h-24 bg-[#334155] animate-pulse rounded-[4px]" />
      )}

      {rows && rows.length === 0 && (
        <p className="font-sans text-sm text-muted-foreground">No runs yet.</p>
      )}

      {rows && rows.length > 0 && (
        <div className="bg-surface-raised border border-border rounded-[4px] overflow-hidden">
          <table className="w-full">
            <thead className="border-b border-border">
              <tr className="text-left">
                <th className="px-5 py-3 font-mono text-[11px] uppercase tracking-[0.05em] text-muted-foreground">
                  Agent
                </th>
                <th className="px-5 py-3 font-mono text-[11px] uppercase tracking-[0.05em] text-muted-foreground">
                  Status
                </th>
                <th className="px-5 py-3 font-mono text-[11px] uppercase tracking-[0.05em] text-muted-foreground">
                  Date
                </th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-5 py-3">
                    {r.agent?.slug ? (
                      <Link
                        to="/agents/$slug"
                        params={{ slug: r.agent.slug }}
                        className="font-mono text-sm text-foreground hover:text-primary"
                      >
                        {r.agent.name}
                      </Link>
                    ) : (
                      <span className="font-mono text-sm text-foreground">
                        {r.agent?.name ?? "Unknown agent"}
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="px-5 py-3 font-mono text-xs text-muted-foreground">
                    {new Date(r.created_at).toLocaleString()}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <Link
                      to="/runs/$id"
                      params={{ id: r.id }}
                      className="font-mono text-xs px-3 py-1.5 rounded-[4px] border border-border text-foreground hover:bg-white/5"
                    >
                      View Result
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export const Route = createFileRoute("/runs")({
  head: () => ({ meta: [{ title: "My Runs — Tasqr" }] }),
  component: () => (
    <RequireAuth>
      <AppShell>
        <MyRuns />
      </AppShell>
    </RequireAuth>
  ),
});
