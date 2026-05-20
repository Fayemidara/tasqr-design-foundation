import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Search, Star } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { RequireAuth } from "@/components/auth/require-auth";
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
  seller: { handle: string | null } | null;
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
          "id,slug,name,short_description,category,pricing_model,one_time_price,subscription_price,average_rating,review_count,run_count,created_at,seller:seller_profiles!agents_seller_id_fkey(handle)",
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
          .select("id,handle")
          .in("id", sellerIds.length ? sellerIds : ["00000000-0000-0000-0000-000000000000"]);
        const map = new Map((sellers ?? []).map((s: any) => [s.id, s.handle]));
        list = (raw ?? []).map((r: any) => ({ ...r, seller: { handle: map.get(r.seller_id) ?? null } }));
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
    <div className="max-w-7xl mx-auto px-8 py-10">
      <div className="mb-6">
        <div className={LABEL}>Marketplace</div>
        <h1 className="font-mono text-[32px]">Browse</h1>
      </div>

      <div className="flex gap-8">
        {/* Sidebar */}
        <aside className="w-[200px] shrink-0">
          <div className={cn(LABEL, "mb-3")}>Categories</div>
          <ul className="space-y-1">
            {CATEGORIES.map((c) => {
              const active = c === category;
              return (
                <li key={c}>
                  <button
                    onClick={() => setCategory(c)}
                    className={cn(
                      "w-full text-left font-mono text-sm px-3 py-2 rounded-[4px] transition-colors border-l-2",
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
                className="w-full bg-[#1E293B] border border-[#334155] rounded-[4px] pl-9 pr-3 py-2 font-sans text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div className="flex items-center gap-2">
              <select
                value={pricing}
                onChange={(e) => setPricing(e.target.value as typeof pricing)}
                className="bg-[#1E293B] border border-[#334155] rounded-[4px] px-3 py-2 font-mono text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="all">All Pricing</option>
                <option value="one_time">One-time</option>
                <option value="subscription">Subscription</option>
              </select>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as typeof sort)}
                className="bg-[#1E293B] border border-[#334155] rounded-[4px] px-3 py-2 font-mono text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="newest">Newest</option>
                <option value="runs">Most Runs</option>
                <option value="rating">Highest Rated</option>
              </select>
            </div>
          </div>

          {/* Grid */}
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
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
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filtered.map((a) => (
                <a
                  key={a.id}
                  href={`/agents/${a.slug ?? a.id}`}
                  className="bg-surface-raised border border-border rounded-[4px] p-5 flex flex-col gap-3 hover:border-primary transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-mono text-base text-foreground leading-tight">
                      {a.name}
                    </h3>
                    {a.category && (
                      <span className="font-mono text-[10px] uppercase tracking-[0.05em] px-2 py-0.5 rounded-[4px] bg-accent text-accent-foreground shrink-0">
                        {a.category}
                      </span>
                    )}
                  </div>
                  <p className="font-sans text-sm text-muted-foreground line-clamp-1">
                    {a.short_description}
                  </p>
                  <div className="font-mono text-sm text-foreground">{priceLine(a)}</div>
                  <div className="flex items-center gap-1 font-mono text-xs text-muted-foreground">
                    <Star className="h-3.5 w-3.5 fill-warning text-warning" />
                    <span className="text-foreground">
                      {Number(a.average_rating ?? 0).toFixed(1)}
                    </span>
                    <span>({a.review_count})</span>
                    <span className="mx-1">·</span>
                    <span>{a.run_count} runs</span>
                  </div>
                  <div className="mt-auto pt-2 border-t border-border font-mono text-xs text-muted-foreground">
                    by @{a.seller?.handle ?? "unknown"}
                  </div>
                </Link>
              ))}
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
    <RequireAuth>
      <AppShell>
        <BrowseInner />
      </AppShell>
    </RequireAuth>
  ),
});
