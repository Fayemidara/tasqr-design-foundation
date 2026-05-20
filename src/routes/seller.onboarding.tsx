import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, FormEvent } from "react";
import { RequireAuth } from "@/components/auth/require-auth";
import { OnboardingLayout } from "@/components/layout/onboarding-layout";
import { Button } from "@/components/ui/tasqr-button";
import { Input, Textarea, Label } from "@/components/ui/tasqr-form";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";

const TOTAL_STEPS = 6;
const HANDLE_RE = /^[a-zA-Z0-9_]+$/;

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

function SellerOnboarding() {
  const { user } = useAuth();
  const navigate = useNavigate();
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

  const onSubmit = async (e: FormEvent) => {
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
    // Step 2+ comes later; for now stay on the route.
    navigate({ to: "/seller/onboarding" });
  };

  return (
    <OnboardingLayout step={1} totalSteps={TOTAL_STEPS}>
      <h2 className="font-mono text-[24px] mb-2">Set up your seller profile</h2>
      <p className="font-sans text-sm text-muted-foreground mb-6">
        This is how buyers will see you on Tasqr
      </p>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
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
    </OnboardingLayout>
  );
}
