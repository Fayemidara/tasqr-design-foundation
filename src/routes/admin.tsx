import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/layout/app-shell";
import { RequireAuth } from "@/components/auth/require-auth";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { notifyPayoutSent } from "@/lib/email.functions";

const ADMIN_EMAIL = import.meta.env.VITE_ADMIN_EMAIL as string | undefined;
const LABEL = "font-mono text-[11px] uppercase tracking-[0.05em] text-muted-foreground";
const SAFETY_ORANGE = "#F4511E";

const Card = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <div className={cn("bg-surface-raised border border-border rounded-[4px]", className)}>
    {children}
  </div>
);

const Skel = ({ className }: { className?: string }) => (
  <div className={cn("bg-[#334155] animate-pulse rounded-[4px]", className)} />
);

type Dispute = {
  id: string;
  buyer_id: string;
  agent_name: string;
  reason: string;
  created_at: string;
  run_id: string;
  transaction_id: string | null;
};

type PendingRefund = {
  id: string;
  paystack_reference: string | null;
  amount: number;
  buyer_id: string;
  created_at: string;
};

type Payout = {
  seller_id: string;
  handle: string | null;
  airtm_email: string | null;
  amount: number;
  transaction_count: number;
};

type LowRel = {
  id: string;
  handle: string | null;
  reliability_score: number;
  timeout_rate: number;
  error_rate: number;
  dispute_rate: number;
};

function AdminInner() {
  const [disputes, setDisputes] = useState<Dispute[] | null>(null);
  const [pending, setPending] = useState<PendingRefund[] | null>(null);
  const [payouts, setPayouts] = useState<Payout[] | null>(null);
  const [lowRel, setLowRel] = useState<LowRel[] | null>(null);
  const [emailState, setEmailState] = useState<Record<string, "idle" | "sending" | "sent" | "error">>({});
  const sendPayout = useServerFn(notifyPayoutSent);

  const load = async () => {
    const client = supabase as any;
    const [d, p, py, lr] = await Promise.all([
      client.rpc("admin_list_open_disputes"),
      client.rpc("admin_list_pending_refunds"),
      client.rpc("admin_list_friday_payouts"),
      client.rpc("admin_list_low_reliability"),
    ]);
    setDisputes(d.data ?? []);
    setPending(p.data ?? []);
    setPayouts(py.data ?? []);
    setLowRel(lr.data ?? []);
  };

  useEffect(() => {
    load();
  }, []);

  const resolveDispute = async (dispute_id: string, action: "refund" | "reject") => {
    await (supabase as any).rpc("admin_resolve_dispute", {
      _dispute_id: dispute_id,
      _action: action,
    });
    load();
  };

  const markRefundProcessed = async (tx_id: string) => {
    await (supabase as any).rpc("admin_mark_refund_processed", { _tx_id: tx_id });
    load();
  };

  const markSellerPaid = async (seller_id: string) => {
    await (supabase as any).rpc("admin_mark_seller_batch_paid", { _seller_id: seller_id });
    load();
  };

  const restoreAgents = async (seller_id: string) => {
    await (supabase as any).rpc("admin_restore_seller_agents", { _seller_id: seller_id });
    load();
  };

  const sendPayoutEmailFor = async (p: Payout) => {
    if (!p.airtm_email) return;
    setEmailState((s) => ({ ...s, [p.seller_id]: "sending" }));
    try {
      const r = await sendPayout({ data: { seller_id: p.seller_id, amount: Number(p.amount) } });
      setEmailState((s) => ({ ...s, [p.seller_id]: r?.success ? "sent" : "error" }));
    } catch {
      setEmailState((s) => ({ ...s, [p.seller_id]: "error" }));
    }
  };

  const exportCSV = () => {
    if (!payouts || payouts.length === 0) return;
    const rows = [["airtm_email", "amount"], ...payouts.map((p) => [p.airtm_email ?? "", String(p.amount)])];
    const csv = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `friday-payouts-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const Btn = ({
    onClick,
    children,
    variant = "default",
  }: {
    onClick: () => void;
    children: React.ReactNode;
    variant?: "default" | "danger" | "primary";
  }) => (
    <button
      onClick={onClick}
      className={cn(
        "font-mono text-xs px-3 py-1.5 rounded-[4px] border",
        variant === "primary" && "bg-primary text-primary-foreground border-primary hover:bg-primary/90",
        variant === "danger" && "border-border text-foreground hover:bg-white/5",
        variant === "default" && "border-border text-foreground hover:bg-white/5",
      )}
      style={variant === "danger" ? { color: SAFETY_ORANGE, borderColor: SAFETY_ORANGE } : undefined}
    >
      {children}
    </button>
  );

  const Th = ({ children }: { children: React.ReactNode }) => (
    <th className="text-left px-4 py-2 font-mono text-[11px] uppercase tracking-[0.05em] text-muted-foreground">
      {children}
    </th>
  );

  return (
    <div className="max-w-7xl mx-auto px-8 py-10 space-y-10">
      <div>
        <h1 className="font-mono text-[32px] mb-1">Admin</h1>
        <p className="text-muted-foreground text-sm font-sans">Internal operations console.</p>
      </div>

      {/* Open Disputes */}
      <section className="space-y-3">
        <div className={LABEL}>Open Disputes</div>
        <Card className="p-5">
          {disputes === null ? (
            <Skel className="h-16 w-full" />
          ) : disputes.length === 0 ? (
            <p className="font-sans text-sm text-muted-foreground">No open disputes.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <Th>Dispute ID</Th>
                    <Th>Buyer</Th>
                    <Th>Agent</Th>
                    <Th>Reason</Th>
                    <Th>Date</Th>
                    <Th>Actions</Th>
                  </tr>
                </thead>
                <tbody>
                  {disputes.map((d) => (
                    <tr key={d.id} className="border-b border-border last:border-0 align-top">
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{d.id.slice(0, 8)}…</td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{d.buyer_id.slice(0, 8)}…</td>
                      <td className="px-4 py-3 font-mono text-foreground">{d.agent_name}</td>
                      <td className="px-4 py-3 font-sans text-sm text-foreground max-w-md">{d.reason}</td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                        {new Date(d.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <Btn onClick={() => resolveDispute(d.id, "refund")} variant="primary">
                            Refund
                          </Btn>
                          <Btn onClick={() => resolveDispute(d.id, "reject")} variant="default">
                            Reject
                          </Btn>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </section>

      {/* Pending Refunds */}
      <section className="space-y-3">
        <div className={LABEL}>Pending Refunds</div>
        <Card className="p-5">
          {pending === null ? (
            <Skel className="h-16 w-full" />
          ) : pending.length === 0 ? (
            <p className="font-sans text-sm text-muted-foreground">No pending refunds.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <Th>Tx ID</Th>
                    <Th>Paystack Ref</Th>
                    <Th>Amount</Th>
                    <Th>Buyer</Th>
                    <Th>Date</Th>
                    <Th>Action</Th>
                  </tr>
                </thead>
                <tbody>
                  {pending.map((p) => (
                    <tr key={p.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{p.id.slice(0, 8)}…</td>
                      <td className="px-4 py-3 font-mono text-xs text-foreground">
                        {p.paystack_reference ?? "—"}
                      </td>
                      <td className="px-4 py-3 font-mono text-foreground">${Number(p.amount).toFixed(2)}</td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{p.buyer_id.slice(0, 8)}…</td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                        {new Date(p.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        <Btn onClick={() => markRefundProcessed(p.id)}>Mark Processed</Btn>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </section>

      {/* Friday Payouts */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div className={LABEL}>Friday Payouts</div>
          <Btn onClick={exportCSV} variant="primary">
            Export CSV
          </Btn>
        </div>
        <Card className="p-5">
          {payouts === null ? (
            <Skel className="h-16 w-full" />
          ) : payouts.length === 0 ? (
            <p className="font-sans text-sm text-muted-foreground">No payouts eligible.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <Th>Handle</Th>
                    <Th>AirTM Email</Th>
                    <Th>Amount</Th>
                    <Th>Tx Count</Th>
                    <Th>Action</Th>
                  </tr>
                </thead>
                <tbody>
                  {payouts.map((p) => (
                    <tr key={p.seller_id} className="border-b border-border last:border-0">
                      <td className="px-4 py-3 font-mono text-foreground">{p.handle ?? "—"}</td>
                      <td className="px-4 py-3 font-mono text-xs text-foreground">{p.airtm_email}</td>
                      <td className="px-4 py-3 font-mono text-foreground">${Number(p.amount).toFixed(2)}</td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{p.transaction_count}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Btn onClick={() => markSellerPaid(p.seller_id)}>Mark Paid</Btn>
                          {p.airtm_email ? (() => {
                            const st = emailState[p.seller_id] ?? "idle";
                            const label = st === "sending" ? "Sending..." : st === "sent" ? "Sent ✓" : "Send Email";
                            return (
                              <div className="flex flex-col gap-1">
                                <button
                                  onClick={() => sendPayoutEmailFor(p)}
                                  disabled={st === "sending" || st === "sent"}
                                  className={cn(
                                    "font-mono text-xs px-3 py-1.5 rounded-[4px] border border-border",
                                    st === "sent" && "cursor-not-allowed",
                                    st === "sending" && "opacity-60 cursor-wait",
                                    st !== "sent" && st !== "sending" && "text-foreground hover:bg-white/5",
                                  )}
                                  style={st === "sent" ? { color: "#3B82F6", borderColor: "#3B82F6" } : undefined}
                                >
                                  {label}
                                </button>
                                {st === "error" && (
                                  <span className="font-mono text-[11px]" style={{ color: SAFETY_ORANGE }}>
                                    Email failed to send. Try again.
                                  </span>
                                )}
                              </div>
                            );
                          })() : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </section>

      {/* Low Reliability */}
      <section className="space-y-3">
        <div className={LABEL}>Low Reliability Sellers</div>
        <Card className="p-5">
          {lowRel === null ? (
            <Skel className="h-16 w-full" />
          ) : lowRel.length === 0 ? (
            <p className="font-sans text-sm text-muted-foreground">No low-reliability sellers.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <Th>Handle</Th>
                    <Th>Score</Th>
                    <Th>Timeout %</Th>
                    <Th>Error %</Th>
                    <Th>Dispute %</Th>
                    <Th>Action</Th>
                  </tr>
                </thead>
                <tbody>
                  {lowRel.map((s) => (
                    <tr key={s.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-3 font-mono text-foreground">{s.handle ?? "—"}</td>
                      <td className="px-4 py-3 font-mono text-foreground">
                        {Number(s.reliability_score).toFixed(0)}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                        {Number(s.timeout_rate).toFixed(1)}%
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                        {Number(s.error_rate).toFixed(1)}%
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                        {Number(s.dispute_rate).toFixed(1)}%
                      </td>
                      <td className="px-4 py-3">
                        <Btn onClick={() => restoreAgents(s.id)}>Restore Agents</Btn>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </section>
    </div>
  );
}

function AdminGate() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (loading) return;
    if (!user || !ADMIN_EMAIL || user.email !== ADMIN_EMAIL) {
      navigate({ to: "/browse" });
    }
  }, [user, loading, navigate]);
  if (loading || !user || user.email !== ADMIN_EMAIL) return null;
  return <AdminInner />;
}

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Admin — Tasqr" }] }),
  component: () => (
    <RequireAuth>
      <AppShell>
        <AdminGate />
      </AppShell>
    </RequireAuth>
  ),
});
