import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Star, Clock, ExternalLink } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

declare global {
  interface Window {
    PaystackPop?: {
      setup(config: {
        key: string;
        email: string;
        amount: number;
        ref: string;
        currency?: string;
        metadata?: Record<string, unknown>;
        onSuccess?: (resp: { reference: string }) => void;
        callback?: (resp: { reference: string }) => void;
        onClose?: () => void;
      }): { openIframe(): void };
    };
  }
}

type InputField = {
  label?: string;
  name?: string;
  type?: string;
  required?: boolean;
};

type Seller = {
  id: string;
  handle: string | null;
  bio: string | null;
  website: string | null;
  reliability_score: number;
};

type Agent = {
  id: string;
  slug: string | null;
  name: string;
  short_description: string;
  full_description: string | null;
  category: string | null;
  pricing_model: string | null;
  one_time_price: number | null;
  subscription_price: number | null;
  average_rating: number;
  review_count: number;
  run_count: number;
  processing_time: string | null;
  input_schema: InputField[] | null;
  status: string;
  seller: Seller | null;
};

type Review = {
  id: string;
  rating: number;
  review_text: string | null;
  created_at: string;
};

const LABEL = "font-mono text-[11px] uppercase tracking-[0.05em] text-muted-foreground";

function Skel({ className }: { className?: string }) {
  return <div className={cn("bg-[#334155] animate-pulse rounded-[4px]", className)} />;
}

function processingCopy(p: string | null | undefined) {
  const v = (p ?? "").toLowerCase();
  if (v === "fast") return { label: "Fast", detail: "under 10 seconds" };
  if (v === "slow") return { label: "Slow", detail: "up to 2 minutes" };
  return { label: "Medium", detail: "10-30 seconds" };
}

function ReliabilityBadge({ score }: { score: number }) {
  if (score >= 90)
    return (
      <span className="font-mono text-[10px] uppercase tracking-[0.05em] px-2 py-0.5 rounded-[4px] bg-warning text-warning-foreground">
        High Reliability
      </span>
    );
  if (score < 70)
    return (
      <span
        className="font-mono text-[10px] uppercase tracking-[0.05em] px-2 py-0.5 rounded-[4px] text-white"
        style={{ backgroundColor: "#F4511E" }}
      >
        Low Reliability
      </span>
    );
  return null;
}

function AgentDetailInner({ slug }: { slug: string }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [paying, setPaying] = useState(false);
  const [payMessage, setPayMessage] = useState<string | null>(null);
  const [agent, setAgent] = useState<Agent | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPricing, setSelectedPricing] = useState<"one_time" | "subscription">("one_time");
  const [activeSubscription, setActiveSubscription] = useState<{
    id: string;
    current_period_end: string;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("agents")
        .select(
          "id,slug,name,short_description,full_description,category,pricing_model,one_time_price,subscription_price,average_rating,review_count,run_count,processing_time,input_schema,status,seller:seller_profiles!agents_seller_id_fkey(id,handle,bio,website,reliability_score)",
        )
        .eq("slug", slug)
        .maybeSingle();
      if (cancelled) return;
      const a = (data as unknown as Agent) ?? null;
      setAgent(a);
      if (a?.id) {
        const { data: rev } = await supabase
          .from("reviews")
          .select("id,rating,review_text,created_at")
          .eq("agent_id", a.id)
          .order("created_at", { ascending: false })
          .limit(5);
        if (!cancelled) setReviews((rev as Review[]) ?? []);

        if (user) {
          const { data: subs } = await supabase
            .from("subscriptions")
            .select("id,current_period_end")
            .eq("buyer_id", user.id)
            .eq("agent_id", a.id)
            .eq("status", "active")
            .gt("current_period_end", new Date().toISOString())
            .order("current_period_end", { ascending: false })
            .limit(1);
          if (!cancelled && subs && subs.length > 0) {
            setActiveSubscription({
              id: subs[0].id as string,
              current_period_end: subs[0].current_period_end as string,
            });
          }
        }
      }
      // default pricing selection
      if (a) {
        const hasOne = a.one_time_price != null && Number(a.one_time_price) > 0;
        const hasSub = a.subscription_price != null && Number(a.subscription_price) > 0;
        setSelectedPricing(hasOne ? "one_time" : hasSub ? "subscription" : "one_time");
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [slug, user]);

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
        <div className="grid grid-cols-1 lg:grid-cols-[65%_35%] gap-8">
          <div className="space-y-6">
            <Skel className="h-10 w-2/3" />
            <Skel className="h-4 w-1/2" />
            <Skel className="h-32 w-full" />
            <Skel className="h-48 w-full" />
          </div>
          <Skel className="h-80 w-full" />
        </div>
      </div>
    );
  }

  if (!agent || agent.status !== "live") {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 text-center">
        <p className="font-sans text-sm text-muted-foreground">This agent is not available.</p>
      </div>
    );
  }

  const seller = agent.seller;
  const proc = processingCopy(agent.processing_time);
  const hasOne = agent.one_time_price != null && Number(agent.one_time_price) > 0;
  const hasSub = agent.subscription_price != null && Number(agent.subscription_price) > 0;
  const showBoth = hasOne && hasSub;

  const ctaPrice =
    selectedPricing === "subscription"
      ? `Subscribe — $${Number(agent.subscription_price).toFixed(2)}/mo`
      : `Run Agent — $${Number(agent.one_time_price ?? 0).toFixed(2)}`;

  const inputs = Array.isArray(agent.input_schema) ? agent.input_schema : [];

  const goToRun = (transactionId: string) => {
    const slugOrId = agent.slug ?? agent.id;
    navigate({
      to: "/runs/new",
      search: { agent: slugOrId, transaction: transactionId } as never,
    });
  };

  const handleBuyOneTime = async () => {
    if (!user || !agent || !seller) return;
    setPayMessage(null);

    // Reuse an existing held transaction that has not been consumed by a run.
    const { data: heldRows } = await supabase
      .from("transactions")
      .select("id")
      .eq("buyer_id", user.id)
      .eq("agent_id", agent.id)
      .eq("status", "held");
    const heldIds = (heldRows ?? []).map((r) => r.id);
    if (heldIds.length > 0) {
      const { data: usedRuns } = await supabase
        .from("runs")
        .select("transaction_id")
        .in("transaction_id", heldIds);
      const usedSet = new Set(
        (usedRuns ?? []).map((r) => r.transaction_id).filter(Boolean) as string[],
      );
      const reusableId = heldIds.find((id) => !usedSet.has(id));
      if (reusableId) {
        goToRun(reusableId);
        return;
      }
    }


    setPaying(true);
    const amount = Number(agent.one_time_price ?? 0);
    const platformFee = Math.round(amount * 10) / 100; // 10%
    const sellerEarnings = Math.round(amount * 90) / 100; // 90%
    const holdUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: inserted, error: insErr } = await supabase
      .from("transactions")
      .insert({
        buyer_id: user.id,
        agent_id: agent.id,
        seller_id: seller.id,
        transaction_type: "one_time",
        amount,
        platform_fee: platformFee,
        seller_earnings: sellerEarnings,
        status: "pending",
        hold_until: holdUntil,
      })
      .select("id")
      .single();

    if (insErr || !inserted) {
      setPaying(false);
      setPayMessage("Could not start checkout. Please try again.");
      return;
    }

    const transactionId = inserted.id;
    const publicKey = import.meta.env.VITE_PAYSTACK_PUBLIC_KEY as string | undefined;
    // eslint-disable-next-line no-console
    console.log("Paystack Public Key:", publicKey);

    if (!publicKey) {
      setPaying(false);
      setPayMessage("Payment system failed to load. Please refresh and try again.");
      return;
    }

    // Wait briefly for the Paystack inline script to load if needed.
    if (!window.PaystackPop) {
      await new Promise<void>((resolve) => {
        let waited = 0;
        const iv = setInterval(() => {
          waited += 100;
          if (window.PaystackPop || waited >= 3000) {
            clearInterval(iv);
            resolve();
          }
        }, 100);
      });
    }

    if (!window.PaystackPop) {
      // eslint-disable-next-line no-console
      console.error("Paystack script not loaded: window.PaystackPop is undefined.");
      setPaying(false);
      setPayMessage("Payment system failed to load. Please refresh and try again.");
      return;
    }

    try {
      const handler = window.PaystackPop.setup({
        key: publicKey,
        email: user.email ?? "",
        amount: Math.round(amount * 100),
        ref: transactionId,
        metadata: {
          transaction_id: transactionId,
          agent_id: agent.id,
          buyer_id: user.id,
        },
        callback: function(response: { reference: string }) {
          (supabase as any)
            .rpc("confirm_transaction", {
              _tx_id: transactionId,
              _paystack_reference: response.reference,
            })
            .then(() => {
              setPaying(false);
              goToRun(transactionId);
            });
        },
        onClose: function() {
          (supabase as any)
            .rpc("cancel_transaction", { _tx_id: transactionId })
            .then(() => {
              setPaying(false);
              setPayMessage("Payment cancelled.");
            });
        },
      });
      handler.openIframe();
      // Reset button state once the iframe is open — don't keep it locked.
      setPaying(false);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Error opening Paystack iframe:", err);
      setPaying(false);
      setPayMessage("Could not open checkout. Please try again.");
    }
  };

  const goToSubscriptionRun = (subscriptionId: string) => {
    const slugOrId = agent?.slug ?? agent?.id ?? "";
    navigate({
      to: "/runs/new",
      search: { agent: slugOrId, subscription: subscriptionId } as never,
    });
  };

  const handleSubscribe = async () => {
    if (!user || !agent || !seller) return;
    setPayMessage(null);
    setPaying(true);

    const amount = Number(agent.subscription_price ?? 0);
    const platformFee = Math.round(amount * 10) / 100;
    const sellerEarnings = Math.round(amount * 90) / 100;
    const holdUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: inserted, error: insErr } = await supabase
      .from("transactions")
      .insert({
        buyer_id: user.id,
        agent_id: agent.id,
        seller_id: seller.id,
        transaction_type: "subscription",
        amount,
        platform_fee: platformFee,
        seller_earnings: sellerEarnings,
        status: "pending",
        hold_until: holdUntil,
      })
      .select("id")
      .single();

    if (insErr || !inserted) {
      setPaying(false);
      setPayMessage("Could not start checkout. Please try again.");
      return;
    }

    const transactionId = inserted.id;
    const publicKey = import.meta.env.VITE_PAYSTACK_PUBLIC_KEY as string | undefined;
    if (!publicKey) {
      setPaying(false);
      setPayMessage("Payment system failed to load. Please refresh and try again.");
      return;
    }

    if (!window.PaystackPop) {
      await new Promise<void>((resolve) => {
        let waited = 0;
        const iv = setInterval(() => {
          waited += 100;
          if (window.PaystackPop || waited >= 3000) {
            clearInterval(iv);
            resolve();
          }
        }, 100);
      });
    }

    if (!window.PaystackPop) {
      setPaying(false);
      setPayMessage("Payment system failed to load. Please refresh and try again.");
      return;
    }

    try {
      const handler = window.PaystackPop.setup({
        key: publicKey,
        email: user.email ?? "",
        amount: Math.round(amount * 100),
        ref: transactionId,
        metadata: {
          transaction_id: transactionId,
          agent_id: agent.id,
          buyer_id: user.id,
          transaction_type: "subscription",
        },
        callback: function (response: { reference: string }) {
          (async () => {
            await (supabase as any).rpc("confirm_transaction", {
              _tx_id: transactionId,
              _paystack_reference: response.reference,
            });
            const now = new Date();
            const end = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
            const { data: subRow } = await supabase
              .from("subscriptions")
              .insert({
                buyer_id: user.id,
                agent_id: agent.id,
                seller_id: seller.id,
                transaction_id: transactionId,
                status: "active",
                current_period_start: now.toISOString(),
                current_period_end: end.toISOString(),
                paystack_reference: response.reference,
              })
              .select("id")
              .single();
            setPaying(false);
            if (subRow?.id) {
              setActiveSubscription({
                id: subRow.id as string,
                current_period_end: end.toISOString(),
              });
              goToSubscriptionRun(subRow.id as string);
            }
          })();
        },
        onClose: function () {
          (supabase as any)
            .rpc("cancel_transaction", { _tx_id: transactionId })
            .then(() => {
              setPaying(false);
              setPayMessage("Payment cancelled.");
            });
        },
      });
      handler.openIframe();
      setPaying(false);
    } catch (err) {
      console.error("Error opening Paystack iframe:", err);
      setPaying(false);
      setPayMessage("Could not open checkout. Please try again.");
    }
  };

  const handleCancelSubscription = async () => {
    if (!activeSubscription) return;
    const { error } = await (supabase as any).rpc("cancel_subscription", {
      _sub_id: activeSubscription.id,
    });
    if (!error) {
      setPayMessage(
        `Subscription cancelled. You retain access until ${new Date(activeSubscription.current_period_end).toLocaleDateString()}.`,
      );
      setActiveSubscription(null);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10">

      <div className="max-w-3xl mx-auto space-y-10 min-w-0">
          {/* Header */}
          <section className="space-y-3">
            <h1 className="font-mono text-2xl lg:text-4xl leading-tight text-foreground">{agent.name}</h1>
            {agent.category && (
              <div>
                <span className="font-mono text-[10px] uppercase tracking-[0.05em] px-2 py-0.5 rounded-[4px] bg-accent text-accent-foreground">
                  {agent.category}
                </span>
              </div>
            )}
            <p className="font-sans text-base text-muted-foreground">{agent.short_description}</p>
            {agent.review_count > 0 && (
              <div className="flex items-center gap-1 font-mono text-xs text-muted-foreground">
                <Star className="h-3.5 w-3.5 fill-warning text-warning" />
                <span className="text-foreground">{Number(agent.average_rating ?? 0).toFixed(1)}</span>
                <span>({agent.review_count} reviews)</span>
                <span className="mx-1">·</span>
                <span>{agent.run_count} runs</span>
              </div>
            )}
          </section>

          {/* Seller */}
          <section className="space-y-3">
            <div className={LABEL}>Seller</div>
            <div className="bg-surface-raised border border-border rounded-[4px] p-5 space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="font-mono text-base text-foreground">
                  @{seller?.handle ?? "unknown"}
                </div>
                {seller && <ReliabilityBadge score={Number(seller.reliability_score)} />}
              </div>
              {seller?.bio && (
                <p className="font-sans text-sm text-muted-foreground">{seller.bio}</p>
              )}
              {seller?.website && (
                <a
                  href={seller.website}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-1 font-mono text-xs text-primary hover:underline"
                >
                  {seller.website}
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          </section>

          {/* About */}
          <section className="space-y-3">
            <div className={LABEL}>About</div>
            {agent.full_description ? (
              <p className="font-sans text-base text-foreground whitespace-pre-wrap">
                {agent.full_description}
              </p>
            ) : (
              <p className="font-sans text-sm text-muted-foreground">No description provided.</p>
            )}
            <div className="inline-flex items-center gap-2 font-mono text-xs text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              <span>Typical response time: {proc.label}</span>
            </div>
          </section>

          {/* Inputs */}
          <section className="space-y-3">
            <div className={LABEL}>Inputs</div>
            {inputs.length === 0 ? (
              <p className="font-sans text-sm text-muted-foreground">
                This agent does not require any inputs.
              </p>
            ) : (
              <div className="bg-surface-raised border border-border rounded-[4px] divide-y divide-border">
                {inputs.map((f, i) => (
                  <div key={i} className="px-5 py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-mono text-sm text-foreground">
                        {f.label ?? f.name ?? `Field ${i + 1}`}
                      </div>
                      <div className="font-mono text-[11px] uppercase tracking-[0.05em] text-muted-foreground">
                        {f.type ?? "text"}
                      </div>
                    </div>
                    <span
                      className={cn(
                        "font-mono text-[10px] uppercase tracking-[0.05em] px-2 py-0.5 rounded-[4px]",
                        f.required
                          ? "bg-accent text-accent-foreground"
                          : "border border-border text-muted-foreground",
                      )}
                    >
                      {f.required ? "Required" : "Optional"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Purchase panel — full width inline block */}
          <section className="space-y-3">
            <div className="bg-surface-raised border border-border rounded-[4px] p-6 space-y-5">
              {showBoth ? (
                <div className="space-y-2">
                  <button
                    onClick={() => setSelectedPricing("one_time")}
                    className={cn(
                      "w-full text-left p-4 rounded-[4px] border transition-colors",
                      selectedPricing === "one_time"
                        ? "border-primary bg-white/5"
                        : "border-border hover:border-primary/50",
                    )}
                  >
                    <div className="font-mono text-2xl text-foreground">
                      ${Number(agent.one_time_price).toFixed(2)}
                    </div>
                    <div className="font-sans text-xs text-muted-foreground">per run</div>
                  </button>
                  <button
                    onClick={() => setSelectedPricing("subscription")}
                    className={cn(
                      "w-full text-left p-4 rounded-[4px] border transition-colors",
                      selectedPricing === "subscription"
                        ? "border-primary bg-white/5"
                        : "border-border hover:border-primary/50",
                    )}
                  >
                    <div className="font-mono text-2xl text-foreground">
                      ${Number(agent.subscription_price).toFixed(2)}
                    </div>
                    <div className="font-sans text-xs text-muted-foreground">per month</div>
                  </button>
                </div>
              ) : hasSub ? (
                <div>
                  <div className="font-mono text-3xl text-foreground">
                    ${Number(agent.subscription_price).toFixed(2)}
                  </div>
                  <div className="font-sans text-xs text-muted-foreground">per month</div>
                </div>
              ) : (
                <div>
                  <div className="font-mono text-3xl text-foreground">
                    ${Number(agent.one_time_price ?? 0).toFixed(2)}
                  </div>
                  <div className="font-sans text-xs text-muted-foreground">per run</div>
                </div>
              )}

              {activeSubscription ? (
                <>
                  <a
                    href={`/runs/new?agent=${agent.slug ?? agent.id}&subscription=${activeSubscription.id}`}
                    className="block w-full text-center bg-primary text-primary-foreground font-mono text-sm py-3 rounded-[4px] hover:bg-primary/90 transition-colors"
                  >
                    Run Agent
                  </a>
                  <p className="font-sans text-xs text-muted-foreground">
                    Subscribed — renews {new Date(activeSubscription.current_period_end).toLocaleDateString()}
                  </p>
                  <button
                    onClick={handleCancelSubscription}
                    className="block w-full text-center bg-secondary text-secondary-foreground font-mono text-sm py-3 rounded-[4px] hover:bg-secondary/80 transition-colors"
                  >
                    Cancel Subscription
                  </button>
                  {payMessage && (
                    <p className="font-sans text-xs" style={{ color: "#FF6A1F" }}>
                      {payMessage}
                    </p>
                  )}
                </>
              ) : !user ? (
                <a
                  href={`/signin?redirect=/agents/${agent.slug ?? agent.id}`}
                  className="block w-full text-center bg-primary text-primary-foreground font-mono text-sm py-3 rounded-[4px] hover:bg-primary/90 transition-colors"
                >
                  {selectedPricing === "subscription" && hasSub
                    ? "Sign in to Subscribe"
                    : "Sign in to Run This Agent"}
                </a>
              ) : selectedPricing === "one_time" && hasOne ? (
                <>
                  <button
                    onClick={handleBuyOneTime}
                    className="block w-full text-center bg-primary text-primary-foreground font-mono text-sm py-3 rounded-[4px] hover:bg-primary/90 transition-colors"
                  >
                    {ctaPrice}
                  </button>
                  {payMessage && (
                    <p className="font-sans text-xs" style={{ color: "#FF6A1F" }}>
                      {payMessage}
                    </p>
                  )}
                </>
              ) : selectedPricing === "subscription" && hasSub ? (
                <>
                  <button
                    onClick={handleSubscribe}
                    className="block w-full text-center bg-primary text-primary-foreground font-mono text-sm py-3 rounded-[4px] hover:bg-primary/90 transition-colors"
                  >
                    {ctaPrice}
                  </button>
                  {payMessage && (
                    <p className="font-sans text-xs" style={{ color: "#FF6A1F" }}>
                      {payMessage}
                    </p>
                  )}
                </>
              ) : (
                <a
                  href={`/runs/new?agent=${agent.slug ?? agent.id}`}
                  className="block w-full text-center bg-primary text-primary-foreground font-mono text-sm py-3 rounded-[4px] hover:bg-primary/90 transition-colors"
                >
                  {ctaPrice}
                </a>
              )}

              <p className="font-sans text-xs text-muted-foreground">
                Powered by your infrastructure. Tasqr handles payments and delivery.
              </p>

              <div className="inline-flex items-center gap-2 font-mono text-xs text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                <span>This agent typically responds in {proc.detail}</span>
              </div>
            </div>

            {seller && Number(seller.reliability_score) >= 90 && (
              <p className="font-mono text-xs text-warning">✓ High reliability seller</p>
            )}
            {seller && Number(seller.reliability_score) < 70 && (
              <p className="font-mono text-xs text-destructive">
                ⚠ This seller has a low reliability score
              </p>
            )}
          </section>

          {/* Reviews */}
          <section className="space-y-3">
            <div className={LABEL}>Reviews</div>
            {reviews.length === 0 ? (
              <p className="font-sans text-sm text-muted-foreground">
                No reviews yet. Be the first to run this agent.
              </p>
            ) : (
              <div className="space-y-3">
                {reviews.map((r) => (
                  <div
                    key={r.id}
                    className="bg-surface-raised border border-border rounded-[4px] p-4 space-y-2"
                  >
                    <div className="flex items-center gap-1 font-mono text-xs text-foreground">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star
                          key={i}
                          className={cn(
                            "h-3.5 w-3.5",
                            i < r.rating ? "fill-warning text-warning" : "text-muted-foreground",
                          )}
                        />
                      ))}
                    </div>
                    {r.review_text && (
                      <p className="font-sans text-sm text-foreground">{r.review_text}</p>
                    )}
                    <div className="font-mono text-[11px] uppercase tracking-[0.05em] text-muted-foreground">
                      Buyer ••• · {new Date(r.created_at).toLocaleDateString()}
                    </div>
                  </div>
                ))}
                {agent.review_count > reviews.length && (
                  <button className="font-mono text-xs text-muted-foreground hover:text-foreground">
                    Show all reviews
                  </button>
                )}
              </div>
            )}
          </section>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/agents/$slug")({
  head: () => ({ meta: [{ title: "Agent — Tasqr" }] }),
  component: RouteComponent,
});

function RouteComponent() {
  const { slug } = Route.useParams();
  return (
    <AppShell>
      <AgentDetailInner slug={slug} />
    </AppShell>
  );
}
