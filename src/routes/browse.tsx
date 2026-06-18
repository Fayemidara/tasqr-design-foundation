import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Search, Star } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

const CATEGORIES = [
  "All",
  "Content",
  "Data",
  "Images",
  "Research",
  "Finance",
  "Marketing",
  "Productivity",
  "Code",
  "Other",
];

type Agent = {
  id: string;
  slug: string | null;
  name: string;
  short_description: string;
  category: string | null;
  pricing_model: string | null;
  one_time_price: number | null;
  subscription_price: number | null;
  average_rating: number;
  review_count: number;
  run_count: number;
  created_at: string;
  seller: { handle: string | null; reliability_score: number | null } | null;
};

const LABEL = "font-mono text-[11px] uppercase tracking-[0.05em] text-muted-foreground";

function Skel({ className }: { className?: string }) {
  return <div className={cn("bg-[#334155] animate-pulse rounded-[4px]", className)} />;
}

function priceLine(a: Agent) {
  const parts: string[] = [];
  if (a.one_time_price != null && Number(a.one_time_price) > 0)
    parts.push(`$${Number(a.one_time_price).toFixed(2)}`);
  if (a.subscription_price != null && Number(a.subscription_price) > 0)
    parts.push(`$${Number(a.subscription_price).toFixed(2)}/mo`);
  return parts.length ? parts.join(" · ") : "—";
}

function BrowseInner() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState("All");
  const [query, setQuery] = useState("");
  const [pricing, setPricing] = useState<"all" | "one_time" | "subscription">("all");
  const [sort, setSort] = useState<"newest" | "runs" | "rating">("newest");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("agents")
        .select(
          "id,slug,name,short_description,category,pricing_model,one_time_price,subscription_price,average_rating,review_count,run_count,created_at,seller:seller_profiles!agents_seller_id_fkey(handle,reliability_score)",
        )
        .eq("status", "live");
      if (cancelled) return;
      // Fallback in case the FK alias isn't named — try a manual join
      let list = (data ?? []) as unknown as Agent[];
      if (!data) {
        const { data: raw } = await supabase
          .from("agents")
          .select("*")
          .eq("status", "live");
        const sellerIds = Array.from(new Set((raw ?? []).map((r: any) => r.seller_id)));
        const { data: sellers } = await supabase
          .from("seller_profiles")
          .select("id,handle,reliability_score")
          .in("id", sellerIds.length ? sellerIds : ["00000000-0000-0000-0000-000000000000"]);
        const map = new Map((sellers ?? []).map((s: any) => [s.id, s]));
        list = (raw ?? []).map((r: any) => ({
          ...r,
          seller: {
            handle: map.get(r.seller_id)?.handle ?? null,
            reliability_score: map.get(r.seller_id)?.reliability_score ?? null,
          },
        }));
      }
      setAgents(list);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    let l = agents;
    if (category !== "All") l = l.filter((a) => (a.category ?? "").toLowerCase() === category.toLowerCase());
    if (query.trim()) {
      const q = query.toLowerCase();
      l = l.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          (a.short_description ?? "").toLowerCase().includes(q),
      );
    }
    if (pricing !== "all") l = l.filter((a) => a.pricing_model === pricing);
    l = [...l].sort((a, b) => {
      if (sort === "runs") return (b.run_count || 0) - (a.run_count || 0);
      if (sort === "rating") return Number(b.average_rating || 0) - Number(a.average_rating || 0);
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
    return l;
  }, [agents, category, query, pricing, sort]);

  const isFiltering = query.trim() !== "" || category !== "All" || pricing !== "all";

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
      <div className="mb-6">
        <div className={LABEL}>Marketplace</div>
        <h1 className="font-mono text-[32px]">Browse</h1>
      </div>

      {/* Mobile category pills */}
      <div className="lg:hidden -mx-4 px-4 mb-5 overflow-x-auto">
        <div className="flex gap-2 w-max">
          {CATEGORIES.map((c) => {
            const active = c === category;
            return (
              <button
                key={c}
                onClick={() => setCategory(c)}
                className={cn(
                  "font-mono text-xs px-3 py-2 min-h-[40px] rounded-full whitespace-nowrap border transition-colors",
                  active
                    ? "border-primary text-white"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
                style={active ? { backgroundColor: "#1976D2" } : undefined}
              >
                {c}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex gap-8">
        {/* Sidebar (desktop only) */}
        <aside className="hidden lg:block w-[200px] shrink-0">
          <div className={cn(LABEL, "mb-3")}>Categories</div>
          <ul className="space-y-1">
            {CATEGORIES.map((c) => {
              const active = c === category;
              return (
                <li key={c}>
                  <button
                    onClick={() => setCategory(c)}
                    className={cn(
                      "w-full text-left font-mono text-sm px-3 py-2 min-h-[44px] rounded-[4px] transition-colors border-l-2",
                      active
                        ? "border-primary bg-white/5 text-foreground"
                        : "border-transparent text-muted-foreground hover:text-foreground hover:bg-white/5",
                    )}
                  >
                    {c}
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        {/* Grid column */}
        <div className="flex-1 min-w-0 space-y-5">
          {/* Top bar */}
          <div className="flex flex-col md:flex-row md:items-center gap-3 md:gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search agents..."
                className="w-full bg-[#1E293B] border border-[#334155] rounded-[4px] pl-9 pr-3 h-11 font-sans text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div className="flex items-center gap-2 w-full md:w-auto">
              <select
                value={pricing}
                onChange={(e) => setPricing(e.target.value as typeof pricing)}
                className="flex-1 md:flex-none bg-[#1E293B] border border-[#334155] rounded-[4px] px-3 h-11 font-mono text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="all">All Pricing</option>
                <option value="one_time">One-time</option>
                <option value="subscription">Subscription</option>
              </select>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as typeof sort)}
                className="flex-1 md:flex-none bg-[#1E293B] border border-[#334155] rounded-[4px] px-3 h-11 font-mono text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="newest">Newest</option>
                <option value="runs">Most Runs</option>
                <option value="rating">Highest Rated</option>
              </select>
            </div>
          </div>

          {/* Grid */}
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 md:gap-5 items-stretch">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="bg-surface-raised border border-border rounded-[4px] p-5 space-y-3"
                >
                  <Skel className="h-5 w-3/4" />
                  <Skel className="h-4 w-full" />
                  <Skel className="h-4 w-2/3" />
                  <Skel className="h-4 w-1/3" />
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="bg-surface-raised border border-border rounded-[4px] py-16 text-center">
              <p className="font-sans text-sm text-muted-foreground">
                {agents.length === 0
                  ? "No agents listed yet. Check back soon."
                  : isFiltering
                    ? "No agents match your search. Try different filters."
                    : "No agents listed yet. Check back soon."}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 md:gap-5 items-stretch">
              {filtered.map((a) => {
                const oneTime = a.one_time_price != null && Number(a.one_time_price) > 0;
                const sub = a.subscription_price != null && Number(a.subscription_price) > 0;
                const showRating = (a.review_count ?? 0) > 0;
                return (
                  <a
                    key={a.id}
                    href={`/agents/${a.slug ?? a.id}`}
                    className="group relative flex flex-col rounded-[4px] border transition-colors duration-150 min-w-0 overflow-hidden"
                    style={{ backgroundColor: "#0F1C2E", borderColor: "#1E3A5F" }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = "#132238";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = "#0F1C2E";
                    }}
                  >
                    {/* Hover left accent bar */}
                    <span
                      aria-hidden
                      className="absolute left-0 top-0 bottom-0 w-[3px] opacity-0 group-hover:opacity-100 transition-opacity duration-150"
                      style={{ backgroundColor: "#1976D2" }}
                    />

                    {/* Zone 1 — Identity */}
                    <div className="flex items-center justify-between gap-3 pt-4 px-4 min-w-0">
                      <h3
                        className="font-mono font-semibold leading-tight min-w-0 line-clamp-2 break-words"
                        style={{ fontSize: "16px", color: "#E2E8F0" }}
                      >
                        {a.name}
                      </h3>
                      {a.category && (
                        <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.05em] px-2 py-0.5 rounded-[4px] bg-accent text-accent-foreground">
                          {a.category}
                        </span>
                      )}
                    </div>

                    {/* Zone 2 — Description */}
                    <p
                      className="font-sans truncate mt-[10px] px-4"
                      style={{ fontSize: "13px", color: "#94A3B8" }}
                    >
                      {a.short_description}
                    </p>

                    {/* Divider */}
                    <div
                      className="mt-3 border-t"
                      style={{ borderColor: "#1E3A5F" }}
                    />

                    {/* Zone 3 — Signal bar */}
                    <div className="p-4 mt-auto">
                      {oneTime && sub ? (
                        <div className="space-y-1">
                          <div className="font-mono" style={{ fontSize: "13px", color: "#E2E8F0" }}>
                            ${Number(a.one_time_price).toFixed(2)}{" "}
                            <span style={{ fontSize: "11px", color: "#94A3B8" }}>per run</span>
                          </div>
                          <div className="font-mono" style={{ fontSize: "13px", color: "#E2E8F0" }}>
                            ${Number(a.subscription_price).toFixed(2)}/mo{" "}
                            <span style={{ fontSize: "11px", color: "#94A3B8" }}>subscription</span>
                          </div>
                        </div>
                      ) : oneTime ? (
                        <div className="font-mono" style={{ fontSize: "15px", color: "#E2E8F0" }}>
                          ${Number(a.one_time_price).toFixed(2)}{" "}
                          <span style={{ fontSize: "11px", color: "#94A3B8" }}>per run</span>
                        </div>
                      ) : sub ? (
                        <div className="font-mono" style={{ fontSize: "15px", color: "#E2E8F0" }}>
                          ${Number(a.subscription_price).toFixed(2)}/mo{" "}
                          <span style={{ fontSize: "11px", color: "#94A3B8" }}>per month</span>
                        </div>
                      ) : (
                        <div className="font-mono" style={{ fontSize: "15px", color: "#E2E8F0" }}>—</div>
                      )}

                      {showRating && (
                        <div className="flex items-center gap-1 mt-2">
                          <Star className="h-3.5 w-3.5 fill-warning text-warning" />
                          <span className="font-mono" style={{ fontSize: "12px", color: "#E2E8F0" }}>
                            {Number(a.average_rating ?? 0).toFixed(1)}
                          </span>
                          <span className="font-mono" style={{ fontSize: "11px", color: "#94A3B8" }}>
                            ({a.review_count})
                          </span>
                          <span className="mx-1" style={{ fontSize: "11px", color: "#94A3B8" }}>·</span>
                          <span className="font-mono" style={{ fontSize: "11px", color: "#94A3B8" }}>
                            {a.run_count} runs
                          </span>
                        </div>
                      )}

                      <div className="font-sans mt-2" style={{ fontSize: "11px", color: "#94A3B8" }}>
                        by @{a.seller?.handle ?? "unknown"}
                      </div>
                    </div>
                  </a>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/browse")({
  head: () => ({ meta: [{ title: "Browse — Tasqr" }] }),
  component: () => (
    <AppShell>
      <BrowseInner />
    </AppShell>
  ),
});
