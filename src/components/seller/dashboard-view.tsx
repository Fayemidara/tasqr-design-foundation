import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Pencil, Pause, Play, ExternalLink, Star } from "lucide-react";
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
};

type Agent = {
  id: string;
  name: string;
  category: string | null;
  status: string;
  run_count: number;
  average_rating: number;
  review_count: number;
  pricing_model: string | null;
  one_time_price: number | null;
  subscription_price: number | null;
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

function StatCard({ label, value, loading }: { label: string; value: string; loading: boolean }) {
  return (
    <Card className="p-5 flex flex-col gap-3">
      <div className={LABEL}>{label}</div>
      {loading ? (
        <Skel className="h-9 w-32" />
      ) : (
        <div className="font-mono text-[32px] text-foreground leading-none">{value}</div>
      )}
      <div className="text-xs text-muted-foreground font-sans">updated in real time</div>
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

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data: prof } = await supabase
        .from("seller_profiles")
        .select("id,total_earnings,withdrawable_balance,reliability_score,airtm_email")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!prof) {
        if (!cancelled) setLoading(false);
        return;
      }
      const { data: ags } = await supabase
        .from("agents")
        .select(
          "id,name,category,status,run_count,average_rating,review_count,pricing_model,one_time_price,subscription_price",
        )
        .eq("seller_id", prof.id)
        .order("created_at", { ascending: false });
      if (cancelled) return;
      setProfile(prof as SellerProfile);
      setAgents((ags ?? []) as Agent[]);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const togglePause = async (a: Agent) => {
    const next = a.status === "live" ? "paused" : "live";
    setAgents((prev) => prev.map((x) => (x.id === a.id ? { ...x, status: next } : x)));
    await supabase.from("agents").update({ status: next }).eq("id", a.id);
  };

  const totalRuns = agents.reduce((s, a) => s + (a.run_count || 0), 0);
  const liveCount = agents.filter((a) => a.status === "live").length;
  const score = Math.max(0, Math.min(100, Number(profile?.reliability_score ?? 0)));

  return (
    <div className="max-w-7xl mx-auto px-8 py-10 space-y-8">
      <div>
        <h1 className="font-mono text-[32px] mb-1">Seller Dashboard</h1>
        <p className="text-muted-foreground text-sm font-sans">
          Manage your agents, track earnings, and monitor performance.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Earnings"
          value={`$${Number(profile?.total_earnings ?? 0).toFixed(2)}`}
          loading={loading}
        />
        <StatCard
          label="Withdrawable Balance"
          value={`$${Number(profile?.withdrawable_balance ?? 0).toFixed(2)}`}
          loading={loading}
        />
        <StatCard label="Total Runs" value={String(totalRuns)} loading={loading} />
        <StatCard label="Active Agents" value={String(liveCount)} loading={loading} />
      </div>

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
        <div className={LABEL}>My Agents</div>
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
                    {["Agent Name", "Category", "Status", "Runs", "Rating", "Price", "Actions"].map(
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
                  {agents.map((a) => (
                    <tr key={a.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-3">
                        <Link
                          to="/seller/agents"
                          className="font-mono text-foreground hover:text-primary"
                        >
                          {a.name}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        {a.category ? <Badge variant="category">{a.category}</Badge> : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={a.status} />
                      </td>
                      <td className="px-4 py-3 font-mono">{a.run_count}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 font-mono">
                          <Star className="h-3.5 w-3.5 fill-warning text-warning" />
                          <span>{Number(a.average_rating ?? 0).toFixed(1)}</span>
                          <span className="text-muted-foreground">
                            ({a.review_count})
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono">{formatPrice(a)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button
                            title="Edit"
                            className="p-1.5 rounded-[4px] hover:bg-white/5 text-muted-foreground hover:text-foreground"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
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
                          <button
                            title="View"
                            className="p-1.5 rounded-[4px] hover:bg-white/5 text-muted-foreground hover:text-foreground"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </button>
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
      <section className="space-y-3">
        <div className={LABEL}>Reliability Score</div>
        <Card className="p-6 space-y-5">
          {loading ? (
            <Skel className="h-9 w-24" />
          ) : (
            <div className="font-mono text-[32px] leading-none">{score.toFixed(0)}</div>
          )}
          <div className="h-2 w-full rounded-[4px] bg-[#334155] overflow-hidden">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${score}%` }}
            />
          </div>
          <div className="grid grid-cols-2 gap-4 pt-2">
            {[
              { label: "Timeout Rate", value: "0%" },
              { label: "Error Rate", value: "0%" },
              { label: "Spec Violations", value: "N/A" },
              { label: "Dispute Rate", value: "0%" },
            ].map((m) => (
              <div key={m.label} className="space-y-1">
                <div className={LABEL}>{m.label}</div>
                <div className="font-mono text-foreground">{m.value}</div>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground font-sans">
            Score updates automatically after each run
          </p>
        </Card>
      </section>
    </div>
  );
}
