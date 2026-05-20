import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, FormEvent } from "react";
import { Copy, Check } from "lucide-react";
import { RequireAuth, RequireSellerMode } from "@/components/auth/require-auth";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/tasqr-button";
import { Input, Label } from "@/components/ui/tasqr-form";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/seller/settings")({
  head: () => ({ meta: [{ title: "Seller Settings — Tasqr" }] }),
  component: () => (
    <RequireAuth>
      <RequireSellerMode>
        <AppShell>
          <SettingsPage />
        </AppShell>
      </RequireSellerMode>
    </RequireAuth>
  ),
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const KEY_CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

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

function formatLastUsed(iso: string | null) {
  if (!iso) return "Never used";
  const d = new Date(iso);
  return `Last used: ${d.toLocaleString()}`;
}

function SettingsPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);

  // payout
  const [airtmEmail, setAirtmEmail] = useState("");
  const [emailErr, setEmailErr] = useState<string | null>(null);
  const [emailSaved, setEmailSaved] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);

  // api key
  const [keyPrefix, setKeyPrefix] = useState<string | null>(null);
  const [lastUsed, setLastUsed] = useState<string | null>(null);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [rotateErr, setRotateErr] = useState<string | null>(null);
  const [rotatedAt, setRotatedAt] = useState<number | null>(null);
  const [, forceTick] = useState(0);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("seller_profiles")
      .select("airtm_email, api_key_prefix, api_key_last_used")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        setAirtmEmail(data?.airtm_email ?? "");
        setKeyPrefix(data?.api_key_prefix ?? null);
        setLastUsed(data?.api_key_last_used ?? null);
        const stored = typeof window !== "undefined"
          ? window.localStorage.getItem(`tasqr_key_rotated_${user.id}`)
          : null;
        if (stored) {
          const t = parseInt(stored, 10);
          if (!isNaN(t) && Date.now() - t < 24 * 60 * 60 * 1000) setRotatedAt(t);
        }
        setLoading(false);
      });
  }, [user]);

  // tick every minute to update grace-period countdown
  useEffect(() => {
    if (!rotatedAt) return;
    const id = setInterval(() => forceTick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, [rotatedAt]);

  const onSaveEmail = async (e: FormEvent) => {
    e.preventDefault();
    setEmailSaved(false);
    setEmailErr(null);
    const v = airtmEmail.trim();
    if (!v) { setEmailErr("AirTM email is required"); return; }
    if (!EMAIL_RE.test(v)) { setEmailErr("Enter a valid email address"); return; }
    if (!user) return;
    setSavingEmail(true);
    const { error } = await supabase
      .from("seller_profiles")
      .update({ airtm_email: v })
      .eq("user_id", user.id);
    setSavingEmail(false);
    if (error) { setEmailErr(error.message); return; }
    setEmailSaved(true);
  };

  const rotate = async () => {
    if (!user) return;
    setRotating(true);
    setRotateErr(null);
    const key = generateApiKey();
    const hash = await sha256Hex(key);
    const prefix = key.slice(0, 12);
    const { error } = await supabase
      .from("seller_profiles")
      .update({ api_key_hash: hash, api_key_prefix: prefix })
      .eq("user_id", user.id);
    setRotating(false);
    if (error) { setRotateErr(error.message); return; }
    const now = Date.now();
    setNewKey(key);
    setKeyPrefix(prefix);
    setCopied(false);
    setRotatedAt(now);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(`tasqr_key_rotated_${user.id}`, String(now));
    }
  };

  const copy = async () => {
    if (!newKey) return;
    await navigator.clipboard.writeText(newKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const graceHoursLeft = rotatedAt
    ? Math.max(0, Math.ceil((24 * 60 * 60 * 1000 - (Date.now() - rotatedAt)) / (60 * 60 * 1000)))
    : 0;

  const maskedKey = keyPrefix ? `${keyPrefix}••••••••••••` : null;

  return (
    <div className="max-w-3xl mx-auto px-8 py-10">
      <h1 className="font-mono text-[32px] mb-10">Settings</h1>

      {/* Section 1 — Payout */}
      <section className="mb-12">
        <h2 className="font-mono text-xs uppercase tracking-wider text-muted-foreground mb-4">
          Payout Settings
        </h2>
        <form onSubmit={onSaveEmail} className="space-y-4">
          <div>
            <Label htmlFor="airtm">AirTM Email</Label>
            <Input
              id="airtm"
              type="email"
              placeholder="your@airtm-email.com"
              value={airtmEmail}
              onChange={(e) => { setAirtmEmail(e.target.value); setEmailSaved(false); setEmailErr(null); }}
              disabled={loading}
            />
            {emailErr && (
              <p className="mt-1 font-mono text-xs" style={{ color: "#F4511E" }}>{emailErr}</p>
            )}
            <p className="mt-2 font-sans text-sm text-muted-foreground">
              Create a free AirTM account at airtm.com and paste your account email here.
              This is how you'll receive your earnings every Friday.
            </p>
          </div>
          <div className="flex items-center gap-4">
            <Button type="submit" disabled={savingEmail || loading}>
              {savingEmail ? "Saving..." : "Save Payout Settings"}
            </Button>
            {emailSaved && (
              <span className="font-mono text-sm" style={{ color: "#1976D2" }}>
                Payout settings saved
              </span>
            )}
          </div>
        </form>
      </section>

      {/* Section 2 — API Key */}
      <section>
        <h2 className="font-mono text-xs uppercase tracking-wider text-muted-foreground mb-4">
          API Key
        </h2>

        {loading ? (
          <div className="h-10 w-64 rounded-[4px]" style={{ background: "#334155" }} />
        ) : (
          <div className="space-y-4">
            {maskedKey ? (
              <code
                className="block font-mono text-sm rounded-[4px] border p-3"
                style={{ background: "#0B0E14", borderColor: "#334155", color: "#FFD600" }}
              >
                {maskedKey}
              </code>
            ) : (
              <p className="font-sans text-sm text-muted-foreground">No API key yet.</p>
            )}

            <p className="font-sans text-sm text-muted-foreground">
              {formatLastUsed(lastUsed)}
            </p>

            {rotatedAt && !newKey && (
              <p className="font-sans text-sm text-muted-foreground">
                Previous key expires in {graceHoursLeft} hour{graceHoursLeft === 1 ? "" : "s"}
              </p>
            )}

            {newKey && (
              <div className="space-y-3">
                <div
                  className="flex items-center gap-2 rounded-[4px] border p-3"
                  style={{ background: "#0B0E14", borderColor: "#334155" }}
                >
                  <code
                    className="flex-1 font-mono text-sm break-all"
                    style={{ color: "#FFD600" }}
                  >
                    {newKey}
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
                  Store this key now. You will never see it again.
                </p>
                <p className="font-sans text-sm text-muted-foreground">
                  Previous key expires in {graceHoursLeft} hour{graceHoursLeft === 1 ? "" : "s"}
                </p>
              </div>
            )}

            {rotateErr && (
              <p className="font-mono text-xs" style={{ color: "#F4511E" }}>{rotateErr}</p>
            )}

            <div className="flex items-center gap-3 pt-2">
              <Button type="button" variant="secondary" onClick={rotate} disabled={rotating}>
                {rotating ? "Rotating..." : "Rotate Key"}
              </Button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
