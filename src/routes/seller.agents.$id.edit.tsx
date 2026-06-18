import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { RequireAuth, RequireSellerMode } from "@/components/auth/require-auth";
import { OnboardingLayout } from "@/components/layout/onboarding-layout";
import { Button } from "@/components/ui/tasqr-button";
import { Input, Label, Textarea } from "@/components/ui/tasqr-form";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import {
  InputFieldsBuilder,
  buildSchema,
  fieldError,
  fieldsFromSchema,
  useFieldIdFactory,
  type BuilderField,
} from "@/components/seller/input-fields-builder";

export const Route = createFileRoute("/seller/agents/$id/edit")({
  head: () => ({ meta: [{ title: "Edit Agent — Tasqr" }] }),
  component: () => (
    <RequireAuth>
      <RequireSellerMode>
        <EditAgentPage />
      </RequireSellerMode>
    </RequireAuth>
  ),
});

const ERR = "#F4511E";
const WARN = "#FFD600";
const OK = "#1976D2";

const CATEGORIES = [
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

const PRICING_MODELS = [
  { id: "one_time", name: "One-time", desc: "Buyers pay per run" },
  { id: "subscription", name: "Subscription", desc: "Buyers pay monthly for unlimited runs" },
  { id: "both", name: "Both", desc: "Offer buyers the choice" },
] as const;

const OUTPUT_TYPES = [
  { id: "text", name: "Text", desc: "Plain text response" },
  { id: "markdown", name: "Markdown", desc: "Formatted text with headers, lists, and code blocks" },
  { id: "image_url", name: "Image URL", desc: "Your agent returns a link to a generated image" },
  { id: "document_url", name: "Document URL", desc: "Your agent returns a link to a generated file" },
] as const;

const PROCESSING_TIMES = [
  { id: "fast", name: "Fast", desc: "Under 10 seconds" },
  { id: "medium", name: "Medium", desc: "10 to 30 seconds" },
  { id: "slow", name: "Slow", desc: "30 seconds to 2 minutes" },
] as const;

type PricingModel = (typeof PRICING_MODELS)[number]["id"];
type OutputType = (typeof OUTPUT_TYPES)[number]["id"];
type ProcessingTime = (typeof PROCESSING_TIMES)[number]["id"];

function slugify(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function randomSuffix() {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let s = "";
  for (let i = 0; i < 4; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

async function getUniqueSlug(base: string, excludeId: string): Promise<string> {
  let candidate = base || `agent-${randomSuffix()}`;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data } = await supabase
      .from("agents")
      .select("id,slug")
      .eq("slug", candidate)
      .maybeSingle();
    if (!data || data.id === excludeId) return candidate;
    candidate = `${base}-${randomSuffix()}`;
  }
}

function SelectableCard({
  selected,
  onClick,
  children,
  className,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "text-left rounded-[4px] border p-4 transition-colors",
        selected ? "bg-surface-raised" : "bg-transparent border-border hover:bg-surface-raised/60",
        className,
      )}
      style={
        selected
          ? { borderColor: "#1976D2", background: "rgba(25,118,210,0.08)" }
          : undefined
      }
    >
      {children}
    </button>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-4 font-mono text-[11px] uppercase tracking-[0.05em] text-muted-foreground">
      {children}
    </div>
  );
}

function WarnNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-3 font-sans text-xs" style={{ color: WARN }}>
      {children}
    </p>
  );
}

function CharCount({ value, max }: { value: number; max?: number }) {
  return (
    <p className="ml-auto font-mono text-[11px] text-muted-foreground">
      {value}
      {max ? `/${max}` : ""}
    </p>
  );
}

function EditAgentPage() {
  const { id } = Route.useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [originalName, setOriginalName] = useState("");

  // Listing
  const [name, setName] = useState("");
  const [shortDescription, setShortDescription] = useState("");
  const [fullDescription, setFullDescription] = useState("");
  const [category, setCategory] = useState("");
  const [pricingModel, setPricingModel] = useState<PricingModel | "">("");
  const [oneTimePrice, setOneTimePrice] = useState<string>("");
  const [subscriptionPrice, setSubscriptionPrice] = useState<string>("");

  // Connection
  const [endpointUrl, setEndpointUrl] = useState("");
  const [outputType, setOutputType] = useState<OutputType | "">("");
  const [processingTime, setProcessingTime] = useState<ProcessingTime | "">("");

  // Input fields
  const { nextId, seed } = useFieldIdFactory();
  const [fields, setFields] = useState<BuilderField[]>([]);

  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data: prof } = await supabase
        .rpc("get_my_seller_profile")
        .maybeSingle();
      if (!prof) {
        if (!cancelled) navigate({ to: "/seller/dashboard" });
        return;
      }
      const { data: agent } = await supabase
        .from("agents")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (cancelled) return;
      if (!agent || agent.seller_id !== prof.id) {
        navigate({ to: "/seller/dashboard" });
        return;
      }

      setOriginalName(agent.name ?? "");
      setName(agent.name ?? "");
      setShortDescription(agent.short_description ?? "");
      setFullDescription(agent.full_description ?? "");
      setCategory(agent.category ?? "");
      setPricingModel((agent.pricing_model as PricingModel) ?? "");
      setOneTimePrice(agent.one_time_price != null ? String(agent.one_time_price) : "");
      setSubscriptionPrice(
        agent.subscription_price != null ? String(agent.subscription_price) : "",
      );
      const { data: endpoint } = await supabase.rpc("get_my_agent_endpoint", {
        _agent_id: id,
      });
      if (cancelled) return;
      setEndpointUrl((endpoint as string | null) ?? "");
      setOutputType((agent.output_type as OutputType) ?? "");
      setProcessingTime((agent.processing_time as ProcessingTime) ?? "");

      const initialFields = fieldsFromSchema(
        agent.input_schema as Array<Record<string, unknown>> | null,
        (i) => seed(i),
      );
      setFields(initialFields);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, id]);

  // Validation
  const nameValid = name.trim().length >= 3 && name.length <= 60;
  const shortValid = shortDescription.trim().length > 0 && shortDescription.length <= 100;
  const fullValid = fullDescription.trim().length >= 50;
  const categoryValid = !!category;
  const showOneTime = pricingModel === "one_time" || pricingModel === "both";
  const showSub = pricingModel === "subscription" || pricingModel === "both";
  const oneTimeNum = parseFloat(oneTimePrice);
  const subNum = parseFloat(subscriptionPrice);
  const oneTimeValid =
    !showOneTime || (oneTimePrice !== "" && !isNaN(oneTimeNum) && oneTimeNum >= 0.5);
  const subValid = !showSub || (subscriptionPrice !== "" && !isNaN(subNum) && subNum >= 1);
  const pricingValid = !!pricingModel && oneTimeValid && subValid;

  const urlValid = (() => {
    if (!endpointUrl.trim()) return false;
    if (!endpointUrl.startsWith("https://")) return false;
    try {
      new URL(endpointUrl);
      return true;
    } catch {
      return false;
    }
  })();

  const fieldsValid =
    fields.length >= 1 && fields.every((f) => fieldError(f) === null);

  const allValid =
    nameValid &&
    shortValid &&
    fullValid &&
    categoryValid &&
    pricingValid &&
    urlValid &&
    !!outputType &&
    !!processingTime &&
    fieldsValid;

  const err = (cond: boolean, msg: string) =>
    touched && !cond ? (
      <p className="mt-1 font-mono text-xs" style={{ color: ERR }}>
        {msg}
      </p>
    ) : null;

  const handleSave = async () => {
    setTouched(true);
    setSaveError(null);
    setSavedAt(null);
    if (!allValid) return;
    setSaving(true);
    try {
      const schema = buildSchema(fields);
      let slug: string | undefined;
      if (name.trim() !== originalName.trim()) {
        slug = await getUniqueSlug(slugify(name.trim()), id);
      }
      const { error } = await supabase
        .from("agents")
        .update({
          name: name.trim(),
          short_description: shortDescription.trim(),
          full_description: fullDescription.trim(),
          category,
          pricing_model: pricingModel,
          one_time_price: showOneTime ? oneTimeNum : null,
          subscription_price: showSub ? subNum : null,
          endpoint_url: endpointUrl.trim(),
          output_type: outputType,
          processing_time: processingTime,
          input_schema: schema as never,
          ...(slug ? { slug } : {}),
        })
        .eq("id", id);
      if (error) {
        setSaveError("Failed to save changes. Please try again.");
      } else {
        setOriginalName(name.trim());
        setSavedAt(Date.now());
      }
    } catch {
      setSaveError("Failed to save changes. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <OnboardingLayoutBare>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => navigate({ to: "/seller/dashboard" })}
        >
          ← Back to Dashboard
        </Button>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => navigate({ to: "/seller/agents/$id/test", params: { id } })}
          >
            Test Agent
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </div>
      <h2 className="font-mono text-[24px] mb-2">Edit Agent</h2>
      <p className="font-sans text-sm text-muted-foreground mb-6">
        Changes save immediately when you click Save Changes.
      </p>

      {loading ? (
        <div className="space-y-3">
          <div className="h-10 bg-[#334155] animate-pulse rounded-[4px]" />
          <div className="h-10 bg-[#334155] animate-pulse rounded-[4px]" />
          <div className="h-40 bg-[#334155] animate-pulse rounded-[4px]" />
        </div>
      ) : (
        <>
          {/* Section 1 — Listing Details */}
          <SectionLabel>Listing Details</SectionLabel>

          <div className="mb-6">
            <Label htmlFor="agent-name">Agent Name</Label>
            <Input
              id="agent-name"
              value={name}
              maxLength={60}
              onChange={(e) => setName(e.target.value)}
            />
            <div className="mt-1 flex justify-between">
              <p className="font-sans text-xs text-muted-foreground">
                Keep it clear and specific. Buyers search by name.
              </p>
              <CharCount value={name.length} max={60} />
            </div>
            {err(
              nameValid,
              name.trim().length < 3 ? "Must be at least 3 characters" : "Maximum 60 characters",
            )}
          </div>

          <div className="mb-6">
            <Label htmlFor="short-desc">One Line Description</Label>
            <Input
              id="short-desc"
              value={shortDescription}
              maxLength={100}
              onChange={(e) => setShortDescription(e.target.value)}
            />
            <div className="mt-1 flex justify-between">
              <p className="font-sans text-xs text-muted-foreground">
                This appears on agent cards in the browse screen.
              </p>
              <CharCount value={shortDescription.length} max={100} />
            </div>
            {err(shortValid, "Required, max 100 characters")}
          </div>

          <div className="mb-6">
            <Label htmlFor="full-desc">Full Description</Label>
            <Textarea
              id="full-desc"
              value={fullDescription}
              onChange={(e) => setFullDescription(e.target.value)}
              className="min-h-[120px]"
            />
            <div className="mt-1 flex justify-between">
              <p className="font-sans text-xs text-muted-foreground">Minimum 50 characters.</p>
              <CharCount value={fullDescription.length} />
            </div>
            {err(fullValid, "Must be at least 50 characters")}
          </div>

          <div className="mb-6">
            <div className="mb-2 font-mono text-[11px] uppercase tracking-[0.05em] text-muted-foreground">
              Category
            </div>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((c) => (
                <SelectableCard
                  key={c}
                  selected={category === c}
                  onClick={() => setCategory(c)}
                  className="px-4 py-2"
                >
                  <span className="font-mono text-sm text-foreground">{c}</span>
                </SelectableCard>
              ))}
            </div>
            {err(categoryValid, "Select a category")}
          </div>

          <div className="mb-8">
            <div className="mb-2 font-mono text-[11px] uppercase tracking-[0.05em] text-muted-foreground">
              Pricing Model
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {PRICING_MODELS.map((p) => (
                <SelectableCard
                  key={p.id}
                  selected={pricingModel === p.id}
                  onClick={() => setPricingModel(p.id)}
                >
                  <div className="font-mono text-sm text-foreground">{p.name}</div>
                  <div className="mt-1 font-sans text-xs text-muted-foreground">{p.desc}</div>
                </SelectableCard>
              ))}
            </div>
            {err(!!pricingModel, "Select a pricing model")}

            {showOneTime && (
              <div className="mt-4">
                <Label htmlFor="one-time-price">Price per run (USD)</Label>
                <Input
                  id="one-time-price"
                  type="number"
                  min={0.5}
                  step={0.01}
                  value={oneTimePrice}
                  onChange={(e) => setOneTimePrice(e.target.value)}
                />
                {err(oneTimeValid, "Minimum $0.50")}
              </div>
            )}
            {showSub && (
              <div className="mt-4">
                <Label htmlFor="sub-price">Monthly subscription price (USD)</Label>
                <Input
                  id="sub-price"
                  type="number"
                  min={1}
                  step={0.01}
                  value={subscriptionPrice}
                  onChange={(e) => setSubscriptionPrice(e.target.value)}
                />
                {err(subValid, "Minimum $1.00")}
              </div>
            )}
          </div>

          {/* Section 2 — Input Fields */}
          <SectionLabel>Input Fields</SectionLabel>
          <WarnNote>
            ⚠ Changing input fields affects buyers who have already purchased access to this
            agent. Make sure any changes are backwards compatible.
          </WarnNote>
          <div className="mb-8">
            <InputFieldsBuilder
              fields={fields}
              setFields={setFields}
              nextId={nextId}
              touched={touched}
            />
          </div>

          {/* Section 3 — Agent Connection */}
          <SectionLabel>Agent Connection</SectionLabel>
          <WarnNote>
            ⚠ Changing your endpoint URL or output type affects all active buyers and
            subscribers immediately.
          </WarnNote>

          <div className="mb-6">
            <Label htmlFor="endpoint">Agent Endpoint</Label>
            <Input
              id="endpoint"
              placeholder="https://your-agent-endpoint.com/run"
              value={endpointUrl}
              onChange={(e) => setEndpointUrl(e.target.value)}
            />
            {err(
              urlValid,
              endpointUrl.trim()
                ? "Must be a valid URL starting with https://"
                : "Endpoint URL is required",
            )}
          </div>

          <div className="mb-6">
            <div className="mb-2 font-mono text-[11px] uppercase tracking-[0.05em] text-muted-foreground">
              Output Type
            </div>
            <div className="grid grid-cols-2 gap-3">
              {OUTPUT_TYPES.map((o) => (
                <SelectableCard
                  key={o.id}
                  selected={outputType === o.id}
                  onClick={() => setOutputType(o.id)}
                >
                  <div className="font-mono text-sm text-foreground">{o.name}</div>
                  <div className="mt-1 font-sans text-xs text-muted-foreground">{o.desc}</div>
                </SelectableCard>
              ))}
            </div>
            {err(!!outputType, "Select an output type")}
          </div>

          <div className="mb-8">
            <div className="mb-2 font-mono text-[11px] uppercase tracking-[0.05em] text-muted-foreground">
              Processing Time
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {PROCESSING_TIMES.map((p) => (
                <SelectableCard
                  key={p.id}
                  selected={processingTime === p.id}
                  onClick={() => setProcessingTime(p.id)}
                >
                  <div className="font-mono text-sm text-foreground">{p.name}</div>
                  <div className="mt-1 font-sans text-xs text-muted-foreground">{p.desc}</div>
                </SelectableCard>
              ))}
            </div>
            {err(!!processingTime, "Select a processing time")}
          </div>

          <Button onClick={handleSave} disabled={saving} className="w-full">
            {saving ? "Saving..." : "Save Changes"}
          </Button>

          {savedAt && (
            <p className="mt-3 font-sans text-sm" style={{ color: OK }}>
              Agent updated successfully.
            </p>
          )}
          {saveError && (
            <p className="mt-3 font-mono text-xs" style={{ color: ERR }}>
              {saveError}
            </p>
          )}
        </>
      )}
    </OnboardingLayoutBare>
  );
}

// Wraps OnboardingLayout but without the step progress bar.
function OnboardingLayoutBare({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="h-[60px] bg-sidebar flex items-center px-4 sm:px-6 border-b border-border">
        <span className="font-mono text-lg font-semibold tracking-tight text-sidebar-foreground">
          TASQR
        </span>
      </header>
      <main className="flex-1 flex flex-col items-center px-4 py-6 sm:py-10">
        <div className="w-full" style={{ maxWidth: 1100 }}>
          <div className="bg-surface-raised border border-border rounded-[4px] p-4 sm:p-6">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}

// Keep OnboardingLayout in scope for any future re-use (avoids stripped import warnings).
void OnboardingLayout;
void useMemo;