import { useState } from "react";
import { Info } from "lucide-react";
import { Button } from "@/components/ui/tasqr-button";
import { Input, Label } from "@/components/ui/tasqr-form";
import { cn } from "@/lib/utils";

export type Step4Data = {
  endpointUrl: string;
  outputType: "text" | "markdown" | "image_url" | "document_url";
  processingTime: "fast" | "medium" | "slow";
};

const OUTPUT_TYPES: { id: Step4Data["outputType"]; name: string; desc: string }[] = [
  { id: "text", name: "Text", desc: "Plain text response" },
  { id: "markdown", name: "Markdown", desc: "Formatted text with headers, lists, and code blocks" },
  { id: "image_url", name: "Image URL", desc: "Your agent returns a link to a generated image" },
  { id: "document_url", name: "Document URL", desc: "Your agent returns a link to a generated file" },
];

const PROCESSING_TIMES: { id: Step4Data["processingTime"]; name: string; desc: string }[] = [
  { id: "fast", name: "Fast", desc: "Under 10 seconds" },
  { id: "medium", name: "Medium", desc: "10 to 30 seconds" },
  { id: "slow", name: "Slow", desc: "30 seconds to 2 minutes" },
];

function SelectableCard({
  selected,
  onClick,
  name,
  desc,
}: {
  selected: boolean;
  onClick: () => void;
  name: string;
  desc: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "text-left rounded-[4px] border p-4 transition-colors",
        selected
          ? "bg-surface-raised"
          : "bg-transparent border-border hover:bg-surface-raised/60",
      )}
      style={
        selected
          ? { borderColor: "#1976D2", background: "rgba(25,118,210,0.08)" }
          : undefined
      }
    >
      <div className="font-mono text-sm text-foreground">{name}</div>
      <div className="mt-1 font-sans text-xs text-muted-foreground">{desc}</div>
    </button>
  );
}

export function Step4ConnectAgent({
  initial,
  onContinue,
  onBack,
}: {
  initial?: Partial<Step4Data>;
  onContinue: (data: Step4Data) => void;
  onBack: () => void;
}) {
  const [endpointUrl, setEndpointUrl] = useState(initial?.endpointUrl ?? "");
  const [outputType, setOutputType] = useState<Step4Data["outputType"] | "">(
    initial?.outputType ?? "",
  );
  const [processingTime, setProcessingTime] = useState<Step4Data["processingTime"] | "">(
    initial?.processingTime ?? "",
  );
  const [urlTouched, setUrlTouched] = useState(false);

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

  const urlError = urlTouched && !urlValid
    ? endpointUrl.trim()
      ? "Must be a valid URL starting with https://"
      : "Endpoint URL is required"
    : "";

  const canContinue = urlValid && !!outputType && !!processingTime;

  return (
    <>
      <div
        className="mb-6 flex items-start gap-3 rounded-[4px] border p-4"
        style={{ background: "#0F1C2E", borderColor: "#1976D2" }}
      >
        <Info className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "#1976D2" }} />
        <p className="font-sans text-sm" style={{ color: "#E2E8F0" }}>
          Before connecting your agent, make sure it follows the Tasqr plugin
          specification.{" "}
          <a
            href="/seller/docs"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 hover:underline"
            style={{ color: "#1976D2" }}
          >
            Read the documentation →
          </a>
        </p>
      </div>

      <h2 className="font-mono text-[24px] mb-2">Connect your agent</h2>
      <p className="font-sans text-sm text-muted-foreground mb-6">
        Tell Tasqr where to send buyer requests and what your agent returns.
      </p>

      {/* Section 1: Endpoint URL */}
      <div className="mb-6">
        <Label
          htmlFor="endpoint"
          className="font-mono text-[11px] uppercase tracking-[0.05em] text-muted-foreground"
        >
          Agent Endpoint
        </Label>
        <Input
          id="endpoint"
          placeholder="https://your-agent-endpoint.com/run"
          value={endpointUrl}
          onChange={(e) => setEndpointUrl(e.target.value)}
          onBlur={() => setUrlTouched(true)}
        />
        {urlError ? (
          <p className="mt-1 font-mono text-xs" style={{ color: "#F4511E" }}>
            {urlError}
          </p>
        ) : (
          <p className="mt-1 font-sans text-xs text-muted-foreground">
            This is the URL Tasqr sends a POST request to every time a buyer clicks Run.
            Your agent must be publicly accessible.
          </p>
        )}
      </div>

      {/* Section 2: Output Type */}
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
              name={o.name}
              desc={o.desc}
            />
          ))}
        </div>
      </div>

      {/* Section 3: Processing Time */}
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
              name={p.name}
              desc={p.desc}
            />
          ))}
        </div>
        <p className="mt-2 font-sans text-xs text-muted-foreground">
          Used to set buyer expectations during loading. Be honest — underestimating
          frustrates buyers.
        </p>
      </div>

      <div className="flex items-center justify-between gap-3">
        <Button variant="secondary" onClick={onBack}>
          Back
        </Button>
        <Button
          disabled={!canContinue}
          onClick={() => {
            if (!canContinue) return;
            onContinue({
              endpointUrl,
              outputType: outputType as Step4Data["outputType"],
              processingTime: processingTime as Step4Data["processingTime"],
            });
          }}
        >
          Continue
        </Button>
      </div>
    </>
  );
}
