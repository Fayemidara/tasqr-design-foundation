import { useState } from "react";
import { Button } from "@/components/ui/tasqr-button";
import { Input, Textarea, Label } from "@/components/ui/tasqr-form";
import { cn } from "@/lib/utils";

export type Step5Data = {
  name: string;
  shortDescription: string;
  fullDescription: string;
  category: string;
  pricingModel: "one_time" | "subscription" | "both";
  oneTimePrice?: number;
  subscriptionPrice?: number;
};

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

const PRICING_MODELS: { id: Step5Data["pricingModel"]; name: string; desc: string }[] = [
  { id: "one_time", name: "One-time", desc: "Buyers pay per run" },
  { id: "subscription", name: "Subscription", desc: "Buyers pay monthly for unlimited runs" },
  { id: "both", name: "Both", desc: "Offer buyers the choice" },
];

const ERROR_COLOR = "#F4511E";

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

function CharCount({ value, max }: { value: number; max?: number }) {
  return (
    <p className="ml-auto font-mono text-[11px] text-muted-foreground">
      {value}
      {max ? `/${max}` : ""}
    </p>
  );
}

export function Step5Listing({
  initial,
  onContinue,
  onBack,
}: {
  initial?: Partial<Step5Data>;
  onContinue: (data: Step5Data) => void;
  onBack: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [shortDescription, setShortDescription] = useState(initial?.shortDescription ?? "");
  const [fullDescription, setFullDescription] = useState(initial?.fullDescription ?? "");
  const [category, setCategory] = useState(initial?.category ?? "");
  const [pricingModel, setPricingModel] = useState<Step5Data["pricingModel"] | "">(
    initial?.pricingModel ?? "",
  );
  const [oneTimePrice, setOneTimePrice] = useState<string>(
    initial?.oneTimePrice != null ? String(initial.oneTimePrice) : "",
  );
  const [subscriptionPrice, setSubscriptionPrice] = useState<string>(
    initial?.subscriptionPrice != null ? String(initial.subscriptionPrice) : "",
  );
  const [touched, setTouched] = useState(false);

  const nameValid = name.trim().length >= 3 && name.length <= 60;
  const shortValid = shortDescription.trim().length > 0 && shortDescription.length <= 100;
  const fullValid = fullDescription.trim().length >= 50;
  const categoryValid = !!category;

  const showOneTime = pricingModel === "one_time" || pricingModel === "both";
  const showSub = pricingModel === "subscription" || pricingModel === "both";
  const oneTimeNum = parseFloat(oneTimePrice);
  const subNum = parseFloat(subscriptionPrice);
  const oneTimeValid = !showOneTime || (oneTimePrice !== "" && !isNaN(oneTimeNum) && oneTimeNum >= 0.5);
  const subValid = !showSub || (subscriptionPrice !== "" && !isNaN(subNum) && subNum >= 1);
  const pricingValid = !!pricingModel && oneTimeValid && subValid;

  const canContinue = nameValid && shortValid && fullValid && categoryValid && pricingValid;

  const err = (cond: boolean, msg: string) =>
    touched && !cond ? (
      <p className="mt-1 font-mono text-xs" style={{ color: ERROR_COLOR }}>
        {msg}
      </p>
    ) : null;

  return (
    <>
      <h2 className="font-mono text-[24px] mb-2">Your listing</h2>
      <p className="font-sans text-sm text-muted-foreground mb-6">
        This is what buyers see when they find your agent on Tasqr.
      </p>

      {/* Agent Name */}
      <div className="mb-6">
        <Label htmlFor="agent-name">Agent Name</Label>
        <Input
          id="agent-name"
          placeholder="e.g. SEO Blog Post Generator"
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
        {err(nameValid, name.trim().length < 3 ? "Must be at least 3 characters" : "Maximum 60 characters")}
      </div>

      {/* One Line Description */}
      <div className="mb-6">
        <Label htmlFor="short-desc">One Line Description</Label>
        <Input
          id="short-desc"
          placeholder="e.g. Paste a URL and get a fully structured SEO blog post in seconds"
          value={shortDescription}
          maxLength={100}
          onChange={(e) => setShortDescription(e.target.value)}
        />
        <div className="mt-1 flex justify-between">
          <p className="font-sans text-xs text-muted-foreground">
            This appears on agent cards in the browse screen. Make it specific and outcome-focused.
          </p>
          <CharCount value={shortDescription.length} max={100} />
        </div>
        {err(shortValid, "Required, max 100 characters")}
      </div>

      {/* Full Description */}
      <div className="mb-6">
        <Label htmlFor="full-desc">Full Description</Label>
        <Textarea
          id="full-desc"
          placeholder="Describe what your agent does, what it's best used for, what inputs work well, and any limitations buyers should know about."
          value={fullDescription}
          onChange={(e) => setFullDescription(e.target.value)}
          className="min-h-[120px]"
        />
        <div className="mt-1 flex justify-between">
          <p className="font-sans text-xs text-muted-foreground">
            Minimum 50 characters.
          </p>
          <CharCount value={fullDescription.length} />
        </div>
        {err(fullValid, "Must be at least 50 characters")}
      </div>

      {/* Category */}
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

      {/* Pricing */}
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
              placeholder="0.50"
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
              placeholder="1.00"
              value={subscriptionPrice}
              onChange={(e) => setSubscriptionPrice(e.target.value)}
            />
            {err(subValid, "Minimum $1.00")}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-3">
        <Button variant="secondary" onClick={onBack}>
          Back
        </Button>
        <Button
          disabled={!canContinue}
          onClick={() => {
            setTouched(true);
            if (!canContinue) return;
            onContinue({
              name: name.trim(),
              shortDescription: shortDescription.trim(),
              fullDescription: fullDescription.trim(),
              category,
              pricingModel: pricingModel as Step5Data["pricingModel"],
              oneTimePrice: showOneTime ? oneTimeNum : undefined,
              subscriptionPrice: showSub ? subNum : undefined,
            });
          }}
        >
          Continue
        </Button>
      </div>
    </>
  );
}
