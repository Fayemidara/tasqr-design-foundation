import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Pencil, Pause, Play, Star, Link as LinkIcon, Check, FlaskConical } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/tasqr-button";
import { Badge } from "@/components/ui/tasqr-badge";
import { cn } from "@/lib/utils";

type SellerProfile = {
  id: string;
  total_earnings: number;
  withdrawable_balance: number;
  reliability_score: number;
  airtm_email: string | null;
  total_paid_out?: number | null;
  last_paid_out_at?: string | null;
};

type Agent = {
  id: string;
  name: string;
  slug: string;
  category: string | null;
  status: string;
  run_count: number;
  average_rating: number;
  review_count: number;
  pricing_model: string | null;
  one_time_price: number | null;
  subscription_price: number | null;
  reliability_score: number;
  paused_reason: string | null;
};

type AgentHealthRow = {
  agent_id: string;
  agent_name: string;
  status: string;
  reliability_score: number;
  total_runs: number;
  timeout_rate: number;
  error_rate: number;
  malformed_count: number;
  dispute_rate: number;
};

const Card = ({ className, children }: { className?: string; children: React.ReactNode }) => (
  <div className={cn("bg-surface-raised border border-border rounded-[4px]", className)}>
    {children}
  </div>
);

const Skel = ({ className }: { className?: string }) => (
  <div className={cn("bg-[#334155] animate-pulse rounded-[4px]", className)} />
);

const LABEL = "font-mono text-[11px] uppercase tracking-[0.05em] text-muted-foreground";

function StatCard({
  label,
  value,
  loading,
  subtitle,
  subtitleColor,
  footer,
}: {
  label: string;
  value: string;
  loading: boolean;
  subtitle?: string;
  subtitleColor?: string;
  footer?: string;
}) {
  return (
    <Card className="p-4 sm:p-5 flex flex-col gap-2 sm:gap-3 min-w-0">
      <div className={LABEL}>{label}</div>
      {loading ? (
        <Skel className="h-8 w-24" />
      ) : (
        <div className="font-mono text-[20px] sm:text-[28px] lg:text-[32px] text-foreground leading-none break-words">
          {value}
        </div>
      )}
      <div
        className={cn("text-[11px] font-sans", !subtitleColor && "text-muted-foreground")}
        style={subtitleColor ? { color: subtitleColor } : undefined}
      >
        {subtitle ?? "updated in real time"}
      </div>
      {footer ? (
        <div className="text-[11px] font-sans text-muted-foreground">{footer}</div>
      ) : null}
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    live: { label: "Live", cls: "bg-primary text-primary-foreground" },
    paused: { label: "Paused", cls: "bg-muted text-muted-foreground" },
    under_review: { label: "Under Review", cls: "bg-warning text-warning-foreground" },
  };
  const v = map[status] ?? { label: status, cls: "bg-muted text-muted-foreground" };
  return (
    <span
      className={cn(
        "inline-flex items-center font-mono text-[11px] font-medium uppercase tracking-[0.05em] px-2 py-0.5 rounded-[4px]",
        v.cls,
      )}
    >
      {v.label}
    </span>
  );
}

function ReliabilityCell({ score, status }: { score: number; status: string }) {
  const s = Math.max(0, Math.min(100, Math.round(score)));
  const num = <span className="font-mono text-foreground">{s}/100</span>;
  let badge: React.ReactNode = null;
  if (status === "paused" && s < 50) {
    badge = (
      <span
        className="font-mono text-[10px] uppercase tracking-[0.05em] px-2 py-0.5 rounded-[4px] text-white"
        style={{ backgroundColor: "#F4511E" }}
      >
        Paused
      </span>
    );
  } else if (s >= 90) {
    badge = (
      <span className="font-mono text-[10px] uppercase tracking-[0.05em] px-2 py-0.5 rounded-[4px] bg-warning text-warning-foreground">
        High
      </span>
    );
  } else if (s < 70) {
    badge = (
      <span
        className="font-mono text-[10px] uppercase tracking-[0.05em] px-2 py-0.5 rounded-[4px] text-white"
        style={{ backgroundColor: "#F4511E" }}
      >
        Low
      </span>
    );
  }
  return (
    <div className="flex items-center gap-2">
      {num}
      {badge}
    </div>
  );
}

function DisputeStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; style: React.CSSProperties; cls: string }> = {
    open: { label: "Open", style: { backgroundColor: "#F4511E", color: "white" }, cls: "" },
    resolved: { label: "Resolved", style: { backgroundColor: "#1F3A93", color: "white" }, cls: "" },
    rejected: { label: "Rejected", style: {}, cls: "bg-muted text-muted-foreground" },
  };
  const v = map[status] ?? map.open;
  return (
    <span
      className={cn(
        "inline-flex items-center font-mono text-[10px] uppercase tracking-[0.05em] px-2 py-0.5 rounded-[4px]",
        v.cls,
      )}
      style={v.style}
    >
      {v.label}
    </span>
  );
}



function formatPrice(a: Agent) {
  const parts: string[] = [];
  if (a.one_time_price != null && Number(a.one_time_price) > 0)
    parts.push(`$${Number(a.one_time_price).toFixed(2)}`);
  if (a.subscription_price != null && Number(a.subscription_price) > 0)
    parts.push(`$${Number(a.subscription_price).toFixed(2)}/mo`);
  return parts.length ? parts.join(" · ") : "—";
}

export function SellerDashboardView() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<SellerProfile | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [withdrawable, setWithdrawable] = useState<number>(0);
  const [refundCount, setRefundCount] = useState<number>(0);
  const [disputes, setDisputes] = useState<
    { id: string; created_at: string; status: string; agent_name: string }[]
  >([]);
  const [health, setHealth] = useState<AgentHealthRow[]>([]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data: prof } = await supabase
        .rpc("get_my_seller_profile")
        .maybeSingle();
      if (!prof) {
        if (!cancelled) setLoading(false);
        return;
      }
      const { data: ags } = await supabase
        .from("agents")
        .select(
          "id,name,slug,category,status,run_count,average_rating,review_count,pricing_model,one_time_price,subscription_price,reliability_score,paused_reason",
        )
        .eq("seller_id", prof.id)
        .order("created_at", { ascending: false });
      if (cancelled) return;
      setProfile(prof as SellerProfile);
      setAgents((ags ?? []) as Agent[]);

      const { data: wb } = await (supabase as any).rpc("get_withdrawable_balance", {
        _seller_profile_id: prof.id,
      });
      if (!cancelled) setWithdrawable(Number(wb ?? 0));

      // Refund-triggering failures in the last 30 days for this seller's agents.
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { count } = await supabase
        .from("transactions")
        .select("id", { count: "exact", head: true })
        .eq("seller_id", prof.id)
        .eq("status", "refunded")
        .gte("refunded_at", since);
      if (!cancelled) setRefundCount(count ?? 0);

      // Per-agent health metrics over the last 30 days.
      const { data: healthRows } = await (supabase as any).rpc(
        "get_agent_health",
        { _seller_id: prof.id },
      );
      if (!cancelled && Array.isArray(healthRows)) {
        setHealth(healthRows as AgentHealthRow[]);
      }

      // Open disputes against this seller's agents (via RPC; no run-row read).
      const { data: openDisputes } = await (supabase as any).rpc(
        "get_seller_open_disputes",
      );
      if (!cancelled && Array.isArray(openDisputes)) {
        setDisputes(
          (openDisputes as any[]).map((d) => ({
              id: d.id,
              created_at: d.created_at,
              status: d.status,
              agent_name: d.agent_name ?? "—",
            })),
        );
      }

      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const togglePause = async (a: Agent) => {
    const next = a.status === "live" ? "paused" : "live";
    const nextReason = next === "paused" ? "voluntary" : null;
    setAgents((prev) =>
      prev.map((x) => (x.id === a.id ? { ...x, status: next, paused_reason: nextReason } : x)),
    );
    await supabase
      .from("agents")
      .update({ status: next, paused_reason: nextReason })
      .eq("id", a.id);
  };

  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = (slug: string) => {
    const url = `https://app.tasqr.app/agents/${slug}`;
    navigator.clipboard.writeText(url).catch(() => {});
    setCopiedId(slug);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const totalRuns = agents.reduce((s, a) => s + (a.run_count || 0), 0);
  const liveCount = agents.filter((a) => a.status === "live").length;
  const score = Math.max(0, Math.min(100, Number(profile?.reliability_score ?? 0)));

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10 space-y-8">
      <div>
        <h1 className="font-mono text-[32px] mb-1">Seller Dashboard</h1>
        <p className="text-muted-foreground text-sm font-sans">
          Manage your agents, track earnings, and monitor performance.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard
          label="Total Earnings"
          value={`$${Number(profile?.total_earnings ?? 0).toFixed(2)}`}
          loading={loading}
          subtitle="all time"
        />
        {(() => {
          const wb = withdrawable;
          let subtitle = "No cleared earnings yet";
          let color: string | undefined;
          if (wb >= 20) {
            subtitle = "Eligible for next Friday payout";
            color = "#1976D2";
          } else if (wb > 0) {
            subtitle = "Minimum $20 required for Friday payout";
          }
          return (
            <StatCard
              label="Withdrawable Balance"
              value={`$${wb.toFixed(2)}`}
              loading={loading}
              subtitle={subtitle}
              subtitleColor={color}
              footer={`$${Number(profile?.total_paid_out ?? 0).toFixed(2)} paid out to date`}
            />
          );
        })()}
        <StatCard label="Total Runs" value={String(totalRuns)} loading={loading} />
        <StatCard label="Active Agents" value={String(liveCount)} loading={loading} />
      </div>

      {!loading && profile && score < 50 && (
        <Card className="p-5" >
          <p
            className="font-sans text-sm"
            style={{ color: "#F4511E" }}
          >
            Your agents have been paused due to low reliability. Improve your agent and contact support to restore.
          </p>
        </Card>
      )}


      {/* Payout banner */}
      <Card className="p-5">
        <p className="font-sans text-sm text-foreground">
          Payouts are sent every Friday via AirTM. Eligible amounts past 7 days and above $20
          will be included in the next batch.
        </p>
        {!loading && profile && !profile.airtm_email && (
          <p className="font-sans text-sm mt-2" style={{ color: "#FFD600" }}>
            Set your AirTM email in Settings to receive payouts.
          </p>
        )}
      </Card>

      {/* Agents table */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div className={LABEL}>My Agents</div>
          <Link to="/seller/agents/new">
            <Button variant="primary">List New Agent</Button>
          </Link>
        </div>
        <Card>
          {loading ? (
            <div className="p-6 space-y-3">
              <Skel className="h-10 w-full" />
              <Skel className="h-10 w-full" />
              <Skel className="h-10 w-full" />
            </div>
          ) : agents.length === 0 ? (
            <div className="p-10 flex flex-col items-center gap-4">
              <p className="text-muted-foreground font-sans text-sm">No agents listed yet</p>
              <Link to="/seller/agents/new">
                <Button variant="primary">List Your First Agent</Button>
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    {[
                      { h: "Agent Name", cls: "" },
                      { h: "Category", cls: "hidden md:table-cell" },
                      { h: "Status", cls: "" },
                      { h: "Reliability", cls: "hidden lg:table-cell" },
                      { h: "Runs", cls: "hidden sm:table-cell" },
                      { h: "Rating", cls: "hidden sm:table-cell" },
                      { h: "Price", cls: "hidden sm:table-cell" },
                      { h: "Actions", cls: "" },
                    ].map(({ h, cls }) => (
                      <th
                        key={h}
                        className={cn(
                          "text-left px-4 py-3 font-mono text-[11px] uppercase tracking-[0.05em] text-muted-foreground",
                          cls,
                        )}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {agents.map((a) => (
                    <tr key={a.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-3">
                        <span className="font-mono text-foreground">{a.name}</span>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        {a.category ? <Badge variant="category">{a.category}</Badge> : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={a.status} />
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        <ReliabilityCell score={Number(a.reliability_score ?? 100)} status={a.status} />
                      </td>
                      <td className="px-4 py-3 font-mono hidden sm:table-cell">{a.run_count}</td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <div className="flex items-center gap-1 font-mono">
                          <Star className="h-3.5 w-3.5 fill-warning text-warning" />
                          <span>{Number(a.average_rating ?? 0).toFixed(1)}</span>
                          <span className="text-muted-foreground">
                            ({a.review_count})
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono hidden sm:table-cell whitespace-nowrap">
                        {formatPrice(a)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          {a.status === "live" && (
                            <button
                              title={copiedId === a.slug ? "Copied!" : "Copy Link"}
                              onClick={() => handleCopy(a.slug)}
                              className="p-1.5 rounded-[4px] hover:bg-white/5 text-muted-foreground hover:text-foreground"
                            >
                              {copiedId === a.slug ? (
                                <Check className="h-4 w-4" />
                              ) : (
                                <LinkIcon className="h-4 w-4" />
                              )}
                            </button>
                          )}
                          <Link
                            to="/seller/agents/$id/edit"
                            params={{ id: a.id }}
                            title="Edit"
                            className="p-1.5 rounded-[4px] hover:bg-white/5 text-muted-foreground hover:text-foreground"
                          >
                            <Pencil className="h-4 w-4" />
                          </Link>
                          <Link
                            to="/seller/agents/$id/test"
                            params={{ id: a.id }}
                            title="Test Agent"
                            className="p-1.5 rounded-[4px] hover:bg-white/5 text-muted-foreground hover:text-foreground"
                          >
                            <FlaskConical className="h-4 w-4" />
                          </Link>
                          {a.status === "paused" && a.paused_reason === "low_reliability" ? (
                            <button
                              disabled
                              title="This agent was paused due to low reliability. Contact support to restore it."
                              className="font-mono text-[11px] uppercase tracking-[0.05em] px-2 py-1 rounded-[4px] bg-muted text-muted-foreground cursor-not-allowed opacity-60"
                            >
                              Paused by System
                            </button>
                          ) : (
                            <button
                              title={a.status === "live" ? "Pause" : "Unpause"}
                              onClick={() => togglePause(a)}
                              disabled={a.status === "under_review"}
                              className="p-1.5 rounded-[4px] hover:bg-white/5 text-muted-foreground hover:text-foreground disabled:opacity-40"
                            >
                              {a.status === "live" ? (
                                <Pause className="h-4 w-4" />
                              ) : (
                                <Play className="h-4 w-4" />
                              )}
                            </button>
                          )}
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

      {/* Reliability */}
      {/* Agent Health */}
      <section className="space-y-3">
        <div className={LABEL}>Agent Health</div>
        <Card>
          {loading ? (
            <div className="p-6 space-y-3">
              <Skel className="h-10 w-full" />
              <Skel className="h-10 w-full" />
            </div>
          ) : health.length === 0 ? (
            <div className="p-10 text-center">
              <p className="text-muted-foreground font-sans text-sm">No agents listed yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    {["Agent", "Reliability", "Timeout Rate", "Error Rate", "Spec Violations", "Dispute Rate"].map(
                      (h) => (
                        <th
                          key={h}
                          className="text-left px-4 py-3 font-mono text-[11px] uppercase tracking-[0.05em] text-muted-foreground"
                        >
                          {h}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {health.map((h) => {
                    const s = Math.max(0, Math.min(100, Number(h.reliability_score ?? 0)));
                    return (
                      <tr key={h.agent_id} className="border-b border-border last:border-0">
                        <td className="px-4 py-3 font-mono text-foreground">{h.agent_name}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3 min-w-[180px]">
                            <span className="font-mono text-foreground">{s.toFixed(0)}/100</span>
                            <div className="h-1.5 flex-1 rounded-[4px] bg-[#334155] overflow-hidden">
                              <div
                                className="h-full bg-primary"
                                style={{ width: `${s}%` }}
                              />
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 font-mono">{Number(h.timeout_rate ?? 0).toFixed(1)}%</td>
                        <td className="px-4 py-3 font-mono">{Number(h.error_rate ?? 0).toFixed(1)}%</td>
                        <td className="px-4 py-3 font-mono">{Number(h.malformed_count ?? 0)}</td>
                        <td className="px-4 py-3 font-mono">{Number(h.dispute_rate ?? 0).toFixed(1)}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <div className="px-5 py-3 border-t border-border space-y-1">
            <p className="text-xs text-muted-foreground font-sans">
              {refundCount} {refundCount === 1 ? "refund" : "refunds"} triggered in the last 30 days
            </p>
            <p className="text-xs text-muted-foreground font-sans">
              Scores update automatically after each run
            </p>
          </div>
        </Card>
      </section>

      {/* Open Disputes */}
      <section className="space-y-3">
        <div className={LABEL}>Open Disputes</div>
        <Card className="p-5 space-y-3">
          {loading ? (
            <Skel className="h-10 w-full" />
          ) : disputes.length === 0 ? (
            <p className="font-sans text-sm text-muted-foreground">No open disputes.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    {["Agent", "Date Raised", "Status"].map((h) => (
                      <th
                        key={h}
                        className="text-left px-4 py-2 font-mono text-[11px] uppercase tracking-[0.05em] text-muted-foreground"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {disputes.map((d) => (
                    <tr key={d.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-3 font-mono text-foreground">{d.agent_name}</td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                        {new Date(d.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        <DisputeStatusBadge status={d.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="font-sans text-xs text-muted-foreground">
            Disputes are reviewed and resolved by Tasqr within 24 hours.
          </p>
        </Card>
      </section>
    </div>
  );
}
