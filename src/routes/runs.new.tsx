import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import ReactMarkdown from "react-markdown";
import { Star, Download } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { RequireAuth } from "@/components/auth/require-auth";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

type InputField = {
  name: string;
  label?: string;
  type?: string;
  placeholder?: string;
  required?: boolean;
  options?: string[];
};

type AgentRow = {
  id: string;
  slug: string | null;
  name: string;
  short_description: string;
  processing_time: string | null;
  input_schema: InputField[] | null;
  endpoint_url: string | null;
  seller: { api_key_prefix: string | null } | null;
};

type ExecState =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "success"; output: string; output_type: string }
  | { kind: "error"; message: string; refundable: boolean };

const LABEL = "font-mono text-[11px] uppercase tracking-[0.05em] text-muted-foreground";

function randomId() {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let s = "";
  for (let i = 0; i < 16; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return `req_${s}`;
}

function timeoutMs(p: string | null | undefined) {
  const v = (p ?? "").toLowerCase();
  if (v === "fast") return 10_000 + 30_000;
  if (v === "slow") return 120_000 + 30_000;
  return 30_000 + 30_000;
}

function processingCopy(p: string | null | undefined) {
  const v = (p ?? "").toLowerCase();
  if (v === "fast")
    return { label: "Fast", running: "Processing your request, this usually takes under 10 seconds" };
  if (v === "slow")
    return { label: "Slow", running: "Processing your request, this may take up to 2 minutes" };
  return {
    label: "Medium",
    running: "Processing your request, this usually takes 10 to 30 seconds",
  };
}

function Ellipsis() {
  return (
    <span className="inline-flex w-6 justify-start">
      <span className="animate-[pulse_1.4s_ease-in-out_infinite]">.</span>
      <span className="animate-[pulse_1.4s_ease-in-out_0.2s_infinite]">.</span>
      <span className="animate-[pulse_1.4s_ease-in-out_0.4s_infinite]">.</span>
    </span>
  );
}

function RunNewInner() {
  const { user } = useAuth();
  const search = useSearch({ strict: false }) as { agent?: string };
  const slugOrId = search.agent ?? "";

  const [agent, setAgent] = useState<AgentRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [values, setValues] = useState<Record<string, string>>({});
  const [files, setFiles] = useState<Record<string, { url: string; name: string }>>({});
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, boolean>>({});
  const [exec, setExec] = useState<ExecState>({ kind: "idle" });
  const [runId, setRunId] = useState<string | null>(null);

  // review UI
  const [rating, setRating] = useState(0);
  const [reviewText, setReviewText] = useState("");
  const [reviewState, setReviewState] = useState<"prompt" | "submitted" | "skipped">("prompt");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const query = supabase
        .from("agents")
        .select(
          "id,slug,name,short_description,processing_time,input_schema,endpoint_url,seller:seller_profiles!agents_seller_id_fkey(api_key_prefix)",
        );
      const { data } = await (slugOrId.length === 36
        ? query.eq("id", slugOrId).maybeSingle()
        : query.eq("slug", slugOrId).maybeSingle());
      if (cancelled) return;
      setAgent((data as unknown as AgentRow) ?? null);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [slugOrId]);

  const inputs = useMemo<InputField[]>(
    () => (Array.isArray(agent?.input_schema) ? agent!.input_schema : []),
    [agent],
  );

  const canRun = useMemo(() => {
    if (exec.kind === "running") return false;
    for (const f of inputs) {
      if (!f.required) continue;
      const t = (f.type ?? "text").toLowerCase();
      if (t === "image_upload" || t === "document_upload") {
        if (!files[f.name]) return false;
      } else {
        if (!values[f.name] || !values[f.name].trim()) return false;
      }
    }
    return true;
  }, [inputs, values, files, exec.kind]);

  const setVal = (name: string, v: string) => {
    setValues((s) => ({ ...s, [name]: v }));
    if (errors[name]) setErrors((s) => ({ ...s, [name]: false }));
  };

  const handleUpload = async (field: InputField, file: File) => {
    if (!user) return;
    setUploading((s) => ({ ...s, [field.name]: true }));
    try {
      const ext = file.name.split(".").pop() ?? "bin";
      const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await supabase.storage.from("run-uploads").upload(path, file, {
        contentType: file.type || undefined,
        upsert: false,
      });
      if (error) throw error;
      const { data: pub } = supabase.storage.from("run-uploads").getPublicUrl(path);
      setFiles((s) => ({ ...s, [field.name]: { url: pub.publicUrl, name: file.name } }));
      if (errors[field.name]) setErrors((s) => ({ ...s, [field.name]: false }));
    } catch (e) {
      console.error("upload failed", e);
    } finally {
      setUploading((s) => ({ ...s, [field.name]: false }));
    }
  };

  const runAgent = async () => {
    if (!agent || !user) return;
    const nextErr: Record<string, boolean> = {};
    for (const f of inputs) {
      if (!f.required) continue;
      const t = (f.type ?? "text").toLowerCase();
      const missing =
        t === "image_upload" || t === "document_upload"
          ? !files[f.name]
          : !values[f.name] || !values[f.name].trim();
      if (missing) nextErr[f.name] = true;
    }
    setErrors(nextErr);
    if (Object.keys(nextErr).length) return;

    const tasqr_request_id = randomId();
    const inputsPayload: Record<string, string> = {};
    const filesPayload: Record<string, string> = {};
    for (const f of inputs) {
      const t = (f.type ?? "text").toLowerCase();
      if (t === "image_upload" || t === "document_upload") {
        if (files[f.name]) filesPayload[f.name] = files[f.name].url;
      } else if (values[f.name] != null) {
        inputsPayload[f.name] = values[f.name];
      }
    }

    setExec({ kind: "running" });

    const { data: inserted, error: insertErr } = await supabase
      .from("runs")
      .insert({
        tasqr_request_id,
        agent_id: agent.id,
        buyer_id: user.id,
        inputs: inputsPayload,
        files: filesPayload,
        status: "processing",
      })
      .select("id")
      .single();

    if (insertErr || !inserted) {
      setExec({
        kind: "error",
        message: "Could not start the run. Please try again.",
        refundable: false,
      });
      return;
    }
    setRunId(inserted.id);

    const payload = {
      tasqr_request_id,
      api_key: agent.seller?.api_key_prefix ?? "",
      inputs: inputsPayload,
      files: filesPayload,
      buyer_id: user.id,
      timestamp: new Date().toISOString(),
    };

    const started = Date.now();
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs(agent.processing_time));

    let resp: Response | null = null;
    try {
      if (!agent.endpoint_url) throw new Error("no_endpoint");
      resp = await fetch(agent.endpoint_url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } catch (e) {
      clearTimeout(t);
      const aborted = (e as Error).name === "AbortError";
      const status = aborted ? "timeout" : "unreachable";
      const message = aborted
        ? "The agent took too long to respond. Your payment will be refunded automatically."
        : "The agent could not be reached. Your payment will be refunded automatically.";
      await supabase
        .from("runs")
        .update({
          status,
          error_message: message,
          error_code: aborted ? "timeout" : "unreachable",
          processing_time_ms: Date.now() - started,
        })
        .eq("id", inserted.id);
      setExec({ kind: "error", message, refundable: true });
      return;
    }
    clearTimeout(t);

    let body: {
      status?: string;
      output?: string;
      output_type?: string;
      error_code?: string;
      error_message?: string;
    } | null = null;
    try {
      body = await resp.json();
    } catch {
      const message = "The agent returned an invalid response. Your payment will be refunded automatically.";
      await supabase
        .from("runs")
        .update({
          status: "malformed",
          error_message: message,
          error_code: "malformed",
          processing_time_ms: Date.now() - started,
        })
        .eq("id", inserted.id);
      setExec({ kind: "error", message, refundable: true });
      return;
    }

    const processing_time_ms = Date.now() - started;

    if (resp.ok && body?.status === "success" && body.output && body.output_type) {
      await supabase
        .from("runs")
        .update({
          status: "success",
          output: body.output,
          output_type: body.output_type,
          processing_time_ms,
        })
        .eq("id", inserted.id);
      setExec({ kind: "success", output: body.output, output_type: body.output_type });
      return;
    }

    const code = body?.error_code ?? "internal_error";
    const sellerFault = code === "external_service_failure" || code === "internal_error";
    if (code === "invalid_input" || code === "content_policy_violation") {
      const message = body?.error_message ?? "Your input was rejected.";
      await supabase
        .from("runs")
        .update({
          status: "error",
          error_code: code,
          error_message: message,
          processing_time_ms,
        })
        .eq("id", inserted.id);
      setExec({ kind: "error", message, refundable: false });
      return;
    }

    if (sellerFault) {
      const message =
        "Something went wrong on the agent's side. Your payment will be refunded automatically.";
      await supabase
        .from("runs")
        .update({
          status: "error",
          error_code: code,
          error_message: message,
          processing_time_ms,
        })
        .eq("id", inserted.id);
      setExec({ kind: "error", message, refundable: true });
      return;
    }

    // malformed shape
    const message = "The agent returned an invalid response. Your payment will be refunded automatically.";
    await supabase
      .from("runs")
      .update({
        status: "malformed",
        error_code: "malformed",
        error_message: message,
        processing_time_ms,
      })
      .eq("id", inserted.id);
    setExec({ kind: "error", message, refundable: true });
  };

  const submitReview = async () => {
    if (!agent || !user || !runId || rating < 1) return;
    await supabase.from("reviews").insert({
      agent_id: agent.id,
      run_id: runId,
      buyer_id: user.id,
      rating,
      review_text: reviewText.trim() || null,
    });
    setReviewState("submitted");
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-8 py-10">
        <div className="h-8 w-1/3 bg-[#334155] animate-pulse rounded-[4px]" />
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="max-w-7xl mx-auto px-8 py-24 text-center">
        <p className="font-sans text-sm text-muted-foreground">Agent not found.</p>
      </div>
    );
  }

  const proc = processingCopy(agent.processing_time);

  return (
    <div className="max-w-7xl mx-auto px-8 py-10">
      <div className="grid grid-cols-1 lg:grid-cols-[60%_40%] gap-8">
        {/* Left */}
        <div className="space-y-8 min-w-0">
          <section className="space-y-2">
            <h1 className="font-mono text-[24px] leading-tight text-foreground">{agent.name}</h1>
            <p className="font-sans text-sm text-muted-foreground">{agent.short_description}</p>
            <p className="font-sans text-xs text-muted-foreground">
              Typical response: {proc.label}
            </p>
          </section>

          <section className="space-y-4">
            <div className={LABEL}>Your inputs</div>
            {inputs.length === 0 && (
              <p className="font-sans text-sm text-muted-foreground">
                This agent does not need any inputs.
              </p>
            )}
            {inputs.map((f) => {
              const t = (f.type ?? "text").toLowerCase();
              const err = errors[f.name];
              const label = (
                <label className="block font-mono text-xs text-foreground mb-1.5">
                  {f.label ?? f.name}
                  {f.required && <span className="text-destructive ml-1">*</span>}
                </label>
              );
              return (
                <div key={f.name}>
                  {label}
                  {t === "textarea" && (
                    <textarea
                      value={values[f.name] ?? ""}
                      onChange={(e) => setVal(f.name, e.target.value)}
                      placeholder={f.placeholder}
                      rows={5}
                      className={cn(
                        "w-full bg-surface-raised border rounded-[4px] px-3 py-2 font-sans text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary",
                        err ? "border-destructive" : "border-border",
                      )}
                    />
                  )}
                  {t === "dropdown" && (
                    <select
                      value={values[f.name] ?? ""}
                      onChange={(e) => setVal(f.name, e.target.value)}
                      className={cn(
                        "w-full bg-surface-raised border rounded-[4px] px-3 py-2 font-sans text-sm text-foreground focus:outline-none focus:border-primary",
                        err ? "border-destructive" : "border-border",
                      )}
                    >
                      <option value="">Select…</option>
                      {(f.options ?? []).map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  )}
                  {(t === "image_upload" || t === "document_upload") && (
                    <div className="space-y-2">
                      <input
                        type="file"
                        accept={
                          t === "image_upload"
                            ? "image/*"
                            : ".pdf,.doc,.docx,.txt,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                        }
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleUpload(f, file);
                        }}
                        className={cn(
                          "w-full bg-surface-raised border rounded-[4px] px-3 py-2 font-sans text-sm text-foreground file:mr-3 file:py-1 file:px-2 file:rounded-[4px] file:border-0 file:bg-primary file:text-primary-foreground file:font-mono file:text-xs",
                          err ? "border-destructive" : "border-border",
                        )}
                      />
                      {uploading[f.name] && (
                        <p className="font-mono text-xs text-muted-foreground">Uploading…</p>
                      )}
                      {files[f.name] && (
                        <p className="font-mono text-xs text-muted-foreground truncate">
                          Uploaded: {files[f.name].name}
                        </p>
                      )}
                    </div>
                  )}
                  {(t === "text" || (t !== "textarea" && t !== "dropdown" && t !== "image_upload" && t !== "document_upload")) && (
                    <input
                      type="text"
                      value={values[f.name] ?? ""}
                      onChange={(e) => setVal(f.name, e.target.value)}
                      placeholder={f.placeholder}
                      className={cn(
                        "w-full bg-surface-raised border rounded-[4px] px-3 py-2 font-sans text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary",
                        err ? "border-destructive" : "border-border",
                      )}
                    />
                  )}
                  {err && (
                    <p className="font-mono text-xs text-destructive mt-1">This field is required.</p>
                  )}
                </div>
              );
            })}

            <button
              onClick={runAgent}
              disabled={!canRun}
              className={cn(
                "w-full font-mono text-sm py-3 rounded-[4px] transition-colors",
                canRun
                  ? "bg-primary text-primary-foreground hover:bg-primary/90"
                  : "bg-muted text-muted-foreground cursor-not-allowed",
              )}
            >
              {exec.kind === "running" ? "Running…" : "Run Agent"}
            </button>
          </section>
        </div>

        {/* Right */}
        <aside className="min-w-0">
          <div className="lg:sticky lg:top-8 space-y-4">
            {exec.kind === "idle" && (
              <div className="bg-surface-raised border border-border rounded-[4px] p-6">
                <p className="font-sans text-sm text-muted-foreground">
                  Fill in the inputs and run the agent to see the result here.
                </p>
              </div>
            )}

            {exec.kind === "running" && (
              <div className="bg-surface-raised border border-border rounded-[4px] p-6">
                <p className="font-sans text-sm text-muted-foreground">
                  {proc.running}
                  <Ellipsis />
                </p>
              </div>
            )}

            {exec.kind === "error" && (
              <div className="bg-surface-raised border border-border rounded-[4px] p-6">
                <p className="font-sans text-sm text-destructive">{exec.message}</p>
              </div>
            )}

            {exec.kind === "success" && (
              <>
                <div className={LABEL}>Result</div>
                {exec.output_type === "text" && (
                  <pre className="bg-[#0B0E14] border border-[#334155] text-foreground rounded-[4px] p-4 font-sans text-sm whitespace-pre-wrap break-words">
                    {exec.output}
                  </pre>
                )}
                {exec.output_type === "markdown" && (
                  <div className="bg-[#0B0E14] border border-[#334155] text-foreground rounded-[4px] p-4 prose prose-invert prose-sm max-w-none">
                    <ReactMarkdown>{exec.output}</ReactMarkdown>
                  </div>
                )}
                {exec.output_type === "image_url" && (
                  <div className="space-y-2">
                    <img
                      src={exec.output}
                      alt="Result"
                      className="w-full rounded-[4px] border border-[#334155]"
                    />
                    <a
                      href={exec.output}
                      download
                      target="_blank"
                      rel="noreferrer noopener"
                      className="inline-flex items-center gap-2 font-mono text-xs px-3 py-2 rounded-[4px] border border-border text-foreground hover:bg-white/5"
                    >
                      <Download className="h-3.5 w-3.5" /> Download
                    </a>
                  </div>
                )}
                {exec.output_type === "document_url" && (
                  <a
                    href={exec.output}
                    download
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex items-center gap-2 bg-primary text-primary-foreground font-mono text-sm px-4 py-2.5 rounded-[4px] hover:bg-primary/90"
                  >
                    <Download className="h-4 w-4" /> Download Document
                  </a>
                )}

                {/* Review prompt */}
                {reviewState === "prompt" && (
                  <div className="bg-surface-raised border border-border rounded-[4px] p-5 space-y-3 mt-4">
                    <div className={LABEL}>How was this agent?</div>
                    <div className="flex items-center gap-1">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button key={n} onClick={() => setRating(n)} aria-label={`${n} stars`}>
                          <Star
                            className={cn(
                              "h-5 w-5",
                              n <= rating ? "fill-warning text-warning" : "text-muted-foreground",
                            )}
                          />
                        </button>
                      ))}
                    </div>
                    <textarea
                      value={reviewText}
                      onChange={(e) => setReviewText(e.target.value)}
                      placeholder="Leave a review (optional)"
                      rows={3}
                      className="w-full bg-background border border-border rounded-[4px] px-3 py-2 font-sans text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
                    />
                    <div className="flex items-center gap-3">
                      <button
                        onClick={submitReview}
                        disabled={rating < 1}
                        className={cn(
                          "font-mono text-xs px-3 py-2 rounded-[4px] border transition-colors",
                          rating >= 1
                            ? "border-border text-foreground hover:bg-white/5"
                            : "border-border text-muted-foreground cursor-not-allowed",
                        )}
                      >
                        Submit Review
                      </button>
                      <button
                        onClick={() => setReviewState("skipped")}
                        className="font-mono text-xs text-muted-foreground hover:text-foreground"
                      >
                        Skip
                      </button>
                    </div>
                  </div>
                )}
                {reviewState === "submitted" && (
                  <p className="font-sans text-sm text-muted-foreground mt-4">
                    Thanks for your review.
                  </p>
                )}

                <div className="pt-2">
                  <Link
                    to="/runs"
                    className="font-mono text-xs text-muted-foreground hover:text-foreground"
                  >
                    View all runs →
                  </Link>
                </div>
              </>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/runs/new")({
  head: () => ({ meta: [{ title: "Run Agent — Tasqr" }] }),
  component: () => (
    <RequireAuth>
      <AppShell>
        <RunNewInner />
      </AppShell>
    </RequireAuth>
  ),
});
