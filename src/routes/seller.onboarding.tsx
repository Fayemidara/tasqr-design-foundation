import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, FormEvent } from "react";
import { Copy, Check } from "lucide-react";
import { RequireAuth } from "@/components/auth/require-auth";
import { OnboardingLayout } from "@/components/layout/onboarding-layout";
import { Button } from "@/components/ui/tasqr-button";
import { Input, Textarea, Label } from "@/components/ui/tasqr-form";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Step3InputBuilder } from "@/components/seller/step3-input-builder";
import { Step4ConnectAgent, type Step4Data } from "@/components/seller/step4-connect-agent";

const TOTAL_STEPS = 6;
const HANDLE_RE = /^[a-zA-Z0-9_]+$/;
const KEY_CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

export const Route = createFileRoute("/seller/onboarding")({
  head: () => ({ meta: [{ title: "Seller Onboarding — Tasqr" }] }),
  component: () => (
    <RequireAuth>
      <SellerOnboarding />
    </RequireAuth>
  ),
});

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return <p className="mt-1 font-mono text-xs text-destructive">{msg}</p>;
}

function generateApiKey() {
  const arr = new Uint32Array(24);
  crypto.getRandomValues(arr);
  let s = "";
  for (let i = 0; i < 24; i++) s += KEY_CHARS[arr[i] % KEY_CHARS.length];
  return `tsk_live_${s}`;
}

async function sha256Hex(input: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function SellerOnboarding() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [step4Data, setStep4Data] = useState<Step4Data | undefined>(undefined);

  // Step 1
  const [handle, setHandle] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [website, setWebsite] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const checkHandleUnique = async () => {
    if (!handle.trim()) return;
    if (!HANDLE_RE.test(handle)) {
      setErrors((e) => ({ ...e, handle: "Only letters, numbers, and underscores" }));
      return;
    }
    const { data } = await supabase
      .from("seller_profiles")
      .select("id")
      .eq("handle", handle)
      .maybeSingle();
    if (data) {
      setErrors((e) => ({ ...e, handle: "Handle already taken" }));
    } else {
      setErrors((e) => {
        const { handle: _h, ...rest } = e;
        return rest;
      });
    }
  };

  const onSubmitStep1 = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const errs: Record<string, string> = {};
    if (!handle.trim()) errs.handle = "Handle is required";
    else if (!HANDLE_RE.test(handle)) errs.handle = "Only letters, numbers, and underscores";
    if (!displayName.trim()) errs.displayName = "Display name is required";
    if (!bio.trim()) errs.bio = "Bio is required";
    else if (bio.length > 280) errs.bio = "Bio must be 280 characters or less";
    if (website.trim()) {
      try {
        new URL(website);
      } catch {
        errs.website = "Enter a valid URL";
      }
    }
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setLoading(true);
    const { data: existing } = await supabase
      .from("seller_profiles")
      .select("id")
      .eq("handle", handle)
      .maybeSingle();
    if (existing) {
      setErrors({ handle: "Handle already taken" });
      setLoading(false);
      return;
    }

    const { error: insertErr } = await supabase.from("seller_profiles").insert({
      user_id: user.id,
      handle,
      bio,
      website: website.trim() || null,
    });
    if (insertErr) {
      setErrors({ handle: insertErr.message });
      setLoading(false);
      return;
    }

    await supabase
      .from("profiles")
      .update({ full_name: displayName })
      .eq("id", user.id);

    setLoading(false);
    setStep(2);
  };

  const isStep3 = step === 3;
  return (
    <OnboardingLayout
      step={step}
      totalSteps={TOTAL_STEPS}
      maxWidth={isStep3 ? 1100 : 600}
    >
      {step === 1 && (
        <>
          <h2 className="font-mono text-[24px] mb-2">Set up your seller profile</h2>
          <p className="font-sans text-sm text-muted-foreground mb-6">
            This is how buyers will see you on Tasqr
          </p>
          <form onSubmit={onSubmitStep1} className="space-y-4" noValidate>
            <div>
              <Label htmlFor="handle">Your handle</Label>
              <Input
                id="handle"
                placeholder="@yourhandle"
                value={handle}
                onChange={(e) => setHandle(e.target.value.replace(/^@/, ""))}
                onBlur={checkHandleUnique}
              />
              <FieldError msg={errors.handle} />
            </div>
            <div>
              <Label htmlFor="displayName">Display name</Label>
              <Input
                id="displayName"
                placeholder="How your name appears to buyers"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
              <FieldError msg={errors.displayName} />
            </div>
            <div>
              <Label htmlFor="bio">Short bio</Label>
              <Textarea
                id="bio"
                placeholder="What you build and what makes your agents worth buying"
                value={bio}
                maxLength={280}
                onChange={(e) => setBio(e.target.value)}
              />
              <div className="mt-1 flex justify-between">
                <FieldError msg={errors.bio} />
                <p className="ml-auto font-mono text-[11px] text-muted-foreground">
                  {bio.length}/280
                </p>
              </div>
            </div>
            <div>
              <Label htmlFor="website">Website or social (optional)</Label>
              <Input
                id="website"
                placeholder="https://"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
              />
              <FieldError msg={errors.website} />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Saving..." : "Continue"}
            </Button>
          </form>
        </>
      )}

      {step === 2 && <Step2 onContinue={() => setStep(3)} />}

      {step === 3 && (
        <Step3InputBuilder
          onContinue={() => setStep(4)}
          onBack={() => setStep(2)}
        />
      )}

      {step >= 4 && (
        <>
          <h2 className="font-mono text-[24px] mb-2">Step {step}</h2>
          <p className="font-sans text-sm text-muted-foreground">Coming soon.</p>
        </>
      )}
    </OnboardingLayout>
  );
}

function Step2({ onContinue }: { onContinue: () => void }) {
  const { user } = useAuth();
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    if (!user) return;
    setSaving(true);
    setError(null);
    const key = generateApiKey();
    const hash = await sha256Hex(key);
    const prefix = key.slice(0, 12);
    const { error: updErr } = await supabase
      .from("seller_profiles")
      .update({ api_key_hash: hash, api_key_prefix: prefix })
      .eq("user_id", user.id);
    if (updErr) {
      setError(updErr.message);
      setSaving(false);
      return;
    }
    setApiKey(key);
    setCopied(false);
    setSaving(false);
  };

  const copy = async () => {
    if (!apiKey) return;
    await navigator.clipboard.writeText(apiKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      <h2 className="font-mono text-[24px] mb-2">Generate your API key</h2>
      <p className="font-sans text-sm text-muted-foreground mb-6">
        This key proves every request your agent receives came from Tasqr. You'll embed
        it in your agent code.
      </p>

      {!apiKey ? (
        <Button onClick={generate} disabled={saving}>
          {saving ? "Generating..." : "Generate API Key"}
        </Button>
      ) : (
        <div className="space-y-4">
          <div
            className="flex items-center gap-2 rounded-[4px] border p-3"
            style={{ background: "#0B0E14", borderColor: "#334155" }}
          >
            <code
              className="flex-1 font-mono text-sm break-all"
              style={{ color: "#FFD600" }}
            >
              {apiKey}
            </code>
            <button
              type="button"
              onClick={copy}
              className="inline-flex items-center gap-1.5 px-2 py-1 rounded-[4px] font-mono text-xs text-foreground hover:bg-white/5"
              aria-label="Copy API key"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <p className="font-mono text-sm" style={{ color: "#F4511E" }}>
            Store this key now. You will never see it again after leaving this step.
          </p>
          <p className="font-sans text-sm text-muted-foreground">
            Paste it into your agent code wherever it verifies incoming requests.
          </p>
          <button
            type="button"
            onClick={generate}
            disabled={saving}
            className="font-mono text-xs text-muted-foreground underline hover:text-foreground disabled:opacity-50"
          >
            Generate a different key
          </button>
        </div>
      )}

      {error && <p className="mt-3 font-mono text-xs text-destructive">{error}</p>}

      <div className="mt-8">
        <Button onClick={onContinue} disabled={!apiKey} className="w-full">
          Continue
        </Button>
      </div>
    </>
  );
}
