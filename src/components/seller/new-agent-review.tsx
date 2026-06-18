import { useEffect, useState } from "react";
import { Pencil } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/tasqr-button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import type { Step4Data } from "./step4-connect-agent";
import type { Step5Data } from "./step5-listing";

const ERR = "#F4511E";

type InputField = {
  field_name?: string;
  label?: string;
  type?: string;
  required?: boolean;
};

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

async function getUniqueSlug(base: string): Promise<string> {
  let candidate = base;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data } = await supabase
      .from("agents")
      .select("slug")
      .eq("slug", candidate)
      .maybeSingle();
    if (!data) return candidate;
    candidate = `${base}-${randomSuffix()}`;
  }
}

function SectionHeader({ title, onEdit }: { title: string; onEdit: () => void }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h3 className="font-mono text-[14px] uppercase tracking-[0.05em] text-muted-foreground">
        {title}
      </h3>
      <button
        type="button"
        onClick={onEdit}
        className="p-1.5 rounded-[4px] hover:bg-white/5 text-muted-foreground hover:text-foreground"
        aria-label={`Edit ${title}`}
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row gap-1 sm:gap-3 py-1">
      <div className="font-mono text-xs uppercase tracking-[0.05em] text-muted-foreground sm:w-[140px] sm:shrink-0">
        {label}
      </div>
      <div className="font-sans text-sm text-foreground flex-1 break-words min-w-0">{value}</div>
    </div>
  );
}

function Section({
  title,
  onEdit,
  children,
}: {
  title: string;
  onEdit: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-surface-raised border border-border rounded-[4px] p-5 mb-4">
      <SectionHeader title={title} onEdit={onEdit} />
      {children}
    </div>
  );
}

export function NewAgentReview({
  step4,
  step5,
  onEdit,
  onBack,
}: {
  step4: Step4Data;
  step5: Step5Data;
  onEdit: (step: number) => void;
  onBack: () => void;
}) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [inputSchema, setInputSchema] = useState<InputField[]>([]);
  const [sellerId, setSellerId] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .rpc("get_my_seller_profile")
        .maybeSingle();
      if (data) {
        setSellerId(data.id);
        if (Array.isArray(data.draft_input_schema)) {
          setInputSchema(data.draft_input_schema as InputField[]);
        }
      }
    })();
  }, [user]);

  const handlePublish = async () => {
    if (!user || !sellerId) return;
    setPublishing(true);
    setError(null);

    const baseSlug = slugify(step5.name);
    const slug = await getUniqueSlug(baseSlug);
    const { error: insertErr } = await supabase.from("agents").insert({
      seller_id: sellerId,
      name: step5.name,
      slug,
      short_description: step5.shortDescription,
      full_description: step5.fullDescription,
      category: step5.category,
      pricing_model: step5.pricingModel,
      one_time_price: step5.oneTimePrice ?? null,
      subscription_price: step5.subscriptionPrice ?? null,
      input_schema: inputSchema as never,
      endpoint_url: step4.endpointUrl,
      output_type: step4.outputType,
      processing_time: step4.processingTime,
      status: "live",
    });

    if (insertErr) {
      setError(insertErr.message);
      setPublishing(false);
      return;
    }

    navigate({ to: "/seller/dashboard" });
  };

  const priceLine = (() => {
    const parts: string[] = [];
    if (step5.oneTimePrice != null) parts.push(`$${step5.oneTimePrice.toFixed(2)} per run`);
    if (step5.subscriptionPrice != null) parts.push(`$${step5.subscriptionPrice.toFixed(2)}/month`);
    return parts.join(" · ") || "—";
  })();

  const pricingLabel =
    step5.pricingModel === "one_time"
      ? "One-time"
      : step5.pricingModel === "subscription"
        ? "Subscription"
        : "Both";

  return (
    <>
      <h2 className="font-mono text-[24px] mb-2">Review and publish</h2>
      <p className="font-sans text-sm text-muted-foreground mb-6">
        Review everything before your agent goes live. You can edit any section by
        clicking the edit icon next to it.
      </p>

      <Section title="Input Fields" onEdit={() => onEdit(1)}>
        {inputSchema.length === 0 ? (
          <p className="font-sans text-sm text-muted-foreground">No fields defined.</p>
        ) : (
          <>
            <p className="font-mono text-xs uppercase tracking-[0.05em] text-muted-foreground mb-3">
              {inputSchema.length} field{inputSchema.length === 1 ? "" : "s"} defined
            </p>
            <div className="space-y-1.5">
              {inputSchema.map((f, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between gap-3 border border-border rounded-[4px] px-3 py-2"
                >
                  <span className="font-sans text-sm text-foreground">
                    {f.label || f.field_name || "Untitled"}
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {f.type} · {f.required ? "required" : "optional"}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </Section>

      <Section title="Agent Connection" onEdit={() => onEdit(2)}>
        <Row label="Endpoint URL" value={step4.endpointUrl} />
        <Row label="Output type" value={step4.outputType} />
        <Row label="Processing time" value={step4.processingTime} />
      </Section>

      <Section title="Listing Details" onEdit={() => onEdit(3)}>
        <Row label="Agent name" value={step5.name} />
        <Row label="One line" value={step5.shortDescription} />
        <Row label="Full description" value={step5.fullDescription} />
        <Row label="Category" value={step5.category} />
        <Row label="Pricing model" value={pricingLabel} />
        <Row label="Price" value={priceLine} />
      </Section>

      <Button
        onClick={handlePublish}
        disabled={publishing || !sellerId}
        className="w-full mt-2"
      >
        {publishing ? "Publishing..." : "Publish Agent"}
      </Button>

      {error && (
        <p className="mt-3 font-mono text-xs" style={{ color: ERR }}>
          {error}
        </p>
      )}

      <div className="mt-6">
        <Button variant="secondary" onClick={onBack} disabled={publishing}>
          Back
        </Button>
      </div>
    </>
  );
}
