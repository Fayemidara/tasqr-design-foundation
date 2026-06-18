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
  transaction_id: string | null;
  agent: { name: string; slug: string | null } | null;
  transaction:
    | {
        status: string;
        dispute_window_ends: string | null;
        dispute_window_closed: boolean | null;
      }
    | null;
};

type SubRow = {
  id: string;
  status: string;
  current_period_end: string;
  transaction_id: string | null;
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
  active: "bg-success/15 text-success border-success/30",
  cancelled: "bg-muted text-muted-foreground border-border",
  expired: "bg-destructive/15 text-destructive border-destructive/30",
  paused: "bg-warning/15 text-warning border-warning/30",
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

const SAFETY_ORANGE = "#F4511E";

function DisputeWindow({ row }: { row: Row }) {
  if (row.status !== "success") return null;
  const tx = row.transaction;
  if (!tx) return null;
  if (tx.status === "disputed") {
    return (
      <span
        className="font-mono text-[10px] uppercase tracking-[0.05em] px-2 py-0.5 rounded-[4px]"
        style={{ backgroundColor: SAFETY_ORANGE, color: "white" }}
      >
        Disputed
      </span>
    );
  }
  const ends = tx.dispute_window_ends ? new Date(tx.dispute_window_ends).getTime() : 0;
  const open = !tx.dispute_window_closed && ends > Date.now();
  if (open) {
    const hours = Math.max(1, Math.ceil((ends - Date.now()) / (1000 * 60 * 60)));
    return (
      <span className="font-mono text-[11px] text-muted-foreground">
        Dispute window closes in {hours} hour{hours === 1 ? "" : "s"}
      </span>
    );
  }
  return <span className="font-mono text-[11px] text-muted-foreground">Settled</span>;
}

function MyRuns() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [subs, setSubs] = useState<SubRow[] | null>(null);
  const [refundMsg, setRefundMsg] = useState<Record<string, string>>({});
  const [cancelling, setCancelling] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("runs")
        .select(
          "id,status,created_at,transaction_id,agent:agents(name,slug),transaction:transactions(status,dispute_window_ends,dispute_window_closed)",
        )
        .eq("buyer_id", user.id)
        .order("created_at", { ascending: false });
      setRows((data as unknown as Row[]) ?? []);
    })();
    (async () => {
      const { data } = await supabase
        .from("subscriptions")
        .select("id,status,current_period_end,transaction_id,agent:agents(name,slug)")
        .eq("buyer_id", user.id)
        .order("created_at", { ascending: false });
      setSubs((data as unknown as SubRow[]) ?? []);
    })();
  }, [user]);

  const cancelSub = async (id: string) => {
    const { error } = await (supabase as any).rpc("cancel_subscription", { _sub_id: id });
    if (!error && subs) {
      setSubs(subs.map((s) => (s.id === id ? { ...s, status: "cancelled" } : s)));
    }
  };

  const cancelAndRefund = async (s: SubRow) => {
    setCancelling((c) => ({ ...c, [s.id]: true }));
    try {
      let amount = 0;
      if (s.transaction_id) {
        const { data: tx } = await supabase
          .from("transactions")
          .select("amount")
          .eq("id", s.transaction_id)
          .maybeSingle();
        amount = Number((tx as { amount?: number } | null)?.amount ?? 0);
      }
      await (supabase as any).rpc("cancel_subscription", { _sub_id: s.id });
      if (s.transaction_id) {
        await (supabase as any).rpc("trigger_refund", {
          _transaction_id: s.transaction_id,
        });
      }
      setSubs((curr) =>
        (curr ?? []).map((x) => (x.id === s.id ? { ...x, status: "cancelled" } : x)),
      );
      setRefundMsg((m) => ({
        ...m,
        [s.id]: `Your subscription has been cancelled. A full refund of $${amount.toFixed(
          2,
        )} will be returned to your original payment method. Refunds are processed every Friday.`,
      }));
    } catch (e) {
      console.error("cancel+refund failed", e);
    } finally {
      setCancelling((c) => ({ ...c, [s.id]: false }));
    }
  };

  const visibleSubs = (subs ?? []).filter((s) => {
    if (s.status === "paused") return true;
    return s.status === "active" && new Date(s.current_period_end).getTime() > Date.now();
  });

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10 space-y-10">
      <div>
        <div className="font-mono text-[11px] uppercase tracking-[0.05em] text-muted-foreground">
          Activity
        </div>
        <h1 className="font-mono text-[32px]">My Runs</h1>
      </div>

      {/* My Subscriptions */}
      <div className="space-y-3">
        <h2 className="font-mono text-lg text-foreground">My Subscriptions</h2>
        {subs === null && (
          <div className="h-20 bg-[#334155] animate-pulse rounded-[4px]" />
        )}
        {subs && visibleSubs.length === 0 && (
          <p className="font-sans text-sm text-muted-foreground">
            No active subscriptions.
          </p>
        )}
        {subs && visibleSubs.length > 0 && (
          <div className="bg-surface-raised border border-border rounded-[4px] overflow-x-auto">
            <table className="w-full min-w-[480px]">
              <thead className="border-b border-border">
                <tr className="text-left">
                  <th className="px-5 py-3 font-mono text-[11px] uppercase tracking-[0.05em] text-muted-foreground">
                    Agent
                  </th>
                  <th className="px-5 py-3 font-mono text-[11px] uppercase tracking-[0.05em] text-muted-foreground">
                    Renews
                  </th>
                  <th className="px-5 py-3 font-mono text-[11px] uppercase tracking-[0.05em] text-muted-foreground">
                    Status
                  </th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {visibleSubs.map((s) => (
                  <tr key={s.id}>
                    <td className="px-5 py-3">
                      {s.agent?.slug ? (
                        <Link
                          to="/agents/$slug"
                          params={{ slug: s.agent.slug }}
                          className="font-mono text-sm text-foreground hover:text-primary"
                        >
                          {s.agent.name}
                        </Link>
                      ) : (
                        <span className="font-mono text-sm text-foreground">
                          {s.agent?.name ?? "Unknown agent"}
                        </span>
                      )}
                      {s.status === "paused" && (
                        <div
                          className="mt-2 px-2 py-1 rounded-[4px] font-mono text-[11px]"
                          style={{
                            backgroundColor: SAFETY_ORANGE,
                            color: "white",
                          }}
                        >
                          This agent has been paused.
                        </div>
                      )}
                      {refundMsg[s.id] && (
                        <p className="font-sans text-xs mt-2" style={{ color: "#1976D2" }}>
                          {refundMsg[s.id]}
                        </p>
                      )}
                    </td>
                    <td className="px-5 py-3 font-mono text-xs text-muted-foreground">
                      {new Date(s.current_period_end).toLocaleDateString()}
                    </td>
                    <td className="px-5 py-3">
                      <StatusBadge status={s.status} />
                    </td>
                    <td className="px-5 py-3 text-right">
                      {s.status === "paused" ? (
                        <button
                          onClick={() => cancelAndRefund(s)}
                          disabled={!!cancelling[s.id] || !!refundMsg[s.id]}
                          className="font-mono text-xs px-3 py-1.5 rounded-[4px] bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
                        >
                          {cancelling[s.id]
                            ? "Cancelling…"
                            : refundMsg[s.id]
                            ? "Cancelled"
                            : "Cancel & Get Full Refund"}
                        </button>
                      ) : (
                        <button
                          onClick={() => cancelSub(s.id)}
                          className="font-mono text-xs px-3 py-1.5 rounded-[4px] border border-border text-foreground hover:bg-white/5"
                        >
                          Cancel
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {rows === null && (
        <div className="h-24 bg-[#334155] animate-pulse rounded-[4px]" />
      )}

      {rows && rows.length === 0 && (
        <p className="font-sans text-sm text-muted-foreground">No runs yet.</p>
      )}

      {rows && rows.length > 0 && (
        <div className="bg-surface-raised border border-border rounded-[4px] overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead className="border-b border-border">
              <tr className="text-left">
                <th className="px-5 py-3 font-mono text-[11px] uppercase tracking-[0.05em] text-muted-foreground">
                  Agent
                </th>
                <th className="px-5 py-3 font-mono text-[11px] uppercase tracking-[0.05em] text-muted-foreground">
                  Status
                </th>
                <th className="px-5 py-3 font-mono text-[11px] uppercase tracking-[0.05em] text-muted-foreground hidden sm:table-cell">
                  Date
                </th>
                <th className="px-5 py-3 font-mono text-[11px] uppercase tracking-[0.05em] text-muted-foreground hidden md:table-cell">
                  Dispute
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
                  <td className="px-5 py-3 font-mono text-xs text-muted-foreground hidden sm:table-cell">
                    {new Date(r.created_at).toLocaleString()}
                  </td>
                  <td className="px-5 py-3 hidden md:table-cell">
                    <DisputeWindow row={r} />
                  </td>
                  <td className="px-5 py-3 text-right">
                    <Link
                      to="/runs/$id"
                      params={{ id: r.id }}
                      className="inline-flex items-center font-mono text-xs px-3 min-h-[36px] rounded-[4px] border border-border text-foreground hover:bg-white/5"
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

export const Route = createFileRoute("/runs/")({
  head: () => ({ meta: [{ title: "My Runs — Tasqr" }] }),
  component: () => (
    <RequireAuth>
      <AppShell>
        <MyRuns />
      </AppShell>
    </RequireAuth>
  ),
});
