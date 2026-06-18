import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import ReactMarkdown from "react-markdown";
import { Download } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { RequireAuth, RequireSellerMode } from "@/components/auth/require-auth";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/tasqr-button";
import { invokeAgentEndpoint } from "@/lib/api-key.functions";

type InputField = {
  field_name: string;
  label?: string;
  type?: string;
  placeholder?: string;
  required?: boolean;
  options?: string[];
};

type AgentRow = {
  id: string;
  name: string;
  short_description: string;
  processing_time: string | null;
  input_schema: InputField[] | null;
  seller_id: string;
};

type FileEntry = { path: string; name: string };

type ExecState =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "success"; output: string; output_type: string }
  | { kind: "error"; message: string; showDocsLink?: boolean };

const LABEL = "font-mono text-[11px] uppercase tracking-[0.05em] text-muted-foreground";
const SAFETY_ORANGE = "#F4511E";
const WARN = "#FFD600";

const IMG_EXTS = ["jpg", "jpeg", "png", "gif", "webp"];
const IMG_MIMES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
const DOC_EXTS = ["pdf", "doc", "docx", "txt"];
const DOC_MIMES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
];
const MAX_IMG = 10 * 1024 * 1024;
const MAX_DOC = 25 * 1024 * 1024;

function randomTestId() {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let s = "";
  for (let i = 0; i < 16; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return `req_test_${s}`;
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

function validateFile(file: File, kind: "image_upload" | "document_upload"): string | null {
  const ext = (file.name.split(".").pop() ?? "").toLowerCase();
  if (kind === "image_upload") {
    const okType = IMG_EXTS.includes(ext) || (file.type && IMG_MIMES.includes(file.type));
    if (!okType) return "Invalid file type.";
    if (file.size > MAX_IMG) return "File too large. Maximum size is 10mb.";
  } else {
    const okType = DOC_EXTS.includes(ext) || (file.type && DOC_MIMES.includes(file.type));
    if (!okType) return "Invalid file type.";
    if (file.size > MAX_DOC) return "File too large. Maximum size is 25mb.";
  }
  return null;
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

function TestAgentInner() {
  const { id } = Route.useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const invokeAgent = useServerFn(invokeAgentEndpoint);

  const requestIdRef = useRef<string>(randomTestId());

  const [agent, setAgent] = useState<AgentRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [values, setValues] = useState<Record<string, string>>({});
  const [files, setFiles] = useState<Record<string, FileEntry>>({});
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const [uploadErrors, setUploadErrors] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, boolean>>({});
  const [exec, setExec] = useState<ExecState>({ kind: "idle" });

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data: prof } = await supabase.rpc("get_my_seller_profile").maybeSingle();
      if (cancelled) return;
      if (!prof) {
        navigate({ to: "/browse" });
        return;
      }
      const { data } = await supabase
        .from("agents")
        .select("id,name,short_description,processing_time,input_schema,seller_id")
        .eq("id", id)
        .maybeSingle();
      if (cancelled) return;
      const ag = (data as unknown as AgentRow) ?? null;
      if (!ag || ag.seller_id !== (prof as { id: string }).id) {
        navigate({ to: "/browse" });
        return;
      }
      setAgent(ag);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user, id, navigate]);

  const inputs = useMemo<InputField[]>(
    () => (Array.isArray(agent?.input_schema) ? agent!.input_schema : []),
    [agent],
  );

  const anyUploading = Object.values(uploading).some(Boolean);

  const canRun = useMemo(() => {
    if (exec.kind === "running") return false;
    if (anyUploading) return false;
    for (const f of inputs) {
      if (!f.required) continue;
      const t = (f.type ?? "text").toLowerCase();
      if (t === "image_upload" || t === "document_upload") {
        if (!files[f.field_name]) return false;
      } else {
        if (!values[f.field_name] || !values[f.field_name].trim()) return false;
      }
    }
    return true;
  }, [inputs, values, files, exec.kind, anyUploading]);

  const setVal = (name: string, v: string) => {
    setValues((s) => ({ ...s, [name]: v }));
    if (errors[name]) setErrors((s) => ({ ...s, [name]: false }));
  };

  const handleUpload = async (field: InputField, file: File) => {
    if (!user) return;
    const kind = (field.type ?? "").toLowerCase() as "image_upload" | "document_upload";
    setUploadErrors((s) => ({ ...s, [field.field_name]: "" }));
    const validationError = validateFile(file, kind);
    if (validationError) {
      setUploadErrors((s) => ({ ...s, [field.field_name]: validationError }));
      setFiles((s) => {
        const next = { ...s };
        delete next[field.field_name];
        return next;
      });
      return;
    }
    setUploading((s) => ({ ...s, [field.field_name]: true }));
    try {
      const path = `${user.id}/${requestIdRef.current}/${field.field_name}`;
      const { error } = await supabase.storage.from("run-uploads").upload(path, file, {
        contentType: file.type || undefined,
        upsert: true,
      });
      if (error) throw error;
      setFiles((s) => ({ ...s, [field.field_name]: { path, name: file.name } }));
      if (errors[field.field_name]) setErrors((s) => ({ ...s, [field.field_name]: false }));
    } catch (e) {
      console.error("upload failed", e);
      setUploadErrors((s) => ({
        ...s,
        [field.field_name]: "File upload failed. Please try again.",
      }));
    } finally {
      setUploading((s) => ({ ...s, [field.field_name]: false }));
    }
  };

  const cleanupUploads = async () => {
    const paths = Object.values(files).map((f) => f.path);
    if (paths.length === 0) return;
    try {
      await supabase.storage.from("run-uploads").remove(paths);
    } catch (e) {
      console.error("upload cleanup failed", e);
    }
  };

  const runTest = async () => {
    if (!agent || !user) return;
    const nextErr: Record<string, boolean> = {};
    for (const f of inputs) {
      if (!f.required) continue;
      const t = (f.type ?? "text").toLowerCase();
      const missing =
        t === "image_upload" || t === "document_upload"
          ? !files[f.field_name]
          : !values[f.field_name] || !values[f.field_name].trim();
      if (missing) nextErr[f.field_name] = true;
    }
    setErrors(nextErr);
    if (Object.keys(nextErr).length) return;

    const tasqr_request_id = requestIdRef.current;
    const inputsPayload: Record<string, string> = {};
    const filesSignedPayload: Record<string, string> = {};

    for (const f of inputs) {
      const t = (f.type ?? "text").toLowerCase();
      if (t === "image_upload" || t === "document_upload") {
        const entry = files[f.field_name];
        if (!entry) continue;
        const { data: signed, error: signErr } = await supabase.storage
          .from("run-uploads")
          .createSignedUrl(entry.path, 60 * 30);
        if (signErr || !signed?.signedUrl) {
          setExec({
            kind: "error",
            message: "Could not prepare your files for the agent. Please try again.",
          });
          return;
        }
        filesSignedPayload[f.field_name] = signed.signedUrl;
      } else if (values[f.field_name] != null) {
        inputsPayload[f.field_name] = values[f.field_name];
      }
    }

    setExec({ kind: "running" });

    const payload = {
      tasqr_request_id,
      inputs: inputsPayload,
      files: filesSignedPayload,
      buyer_id: user.id,
      timestamp: new Date().toISOString(),
    };

    let invokeResult: Awaited<ReturnType<typeof invokeAgent>>;
    try {
      invokeResult = await invokeAgent({
        data: {
          agent_id: agent.id,
          timeout_ms: timeoutMs(agent.processing_time),
          payload,
        },
      });
    } catch {
      setExec({
        kind: "error",
        message:
          "✗ Unreachable — Could not connect to your endpoint. Make sure your webhook URL is active and publicly accessible.",
      });
      await cleanupUploads();
      return;
    }

    if (invokeResult.kind === "timeout") {
      setExec({
        kind: "error",
        message:
          "✗ Timeout — Your endpoint did not respond within the declared processing time plus 30 seconds. Consider increasing your processing time setting or optimizing your workflow.",
      });
      await cleanupUploads();
      return;
    }
    if (invokeResult.kind === "unreachable") {
      setExec({
        kind: "error",
        message:
          "✗ Unreachable — Could not connect to your endpoint. Make sure your webhook URL is active and publicly accessible.",
      });
      await cleanupUploads();
      return;
    }

    if (invokeResult.parseFailed) {
      setExec({
        kind: "error",
        message:
          "✗ Malformed Response — Your endpoint's response did not match the Tasqr spec. Check the required response format in your seller documentation.",
        showDocsLink: true,
      });
      await cleanupUploads();
      return;
    }

    const body = invokeResult.body;

    if (invokeResult.ok && body?.status === "success" && body.output && body.output_type) {
      setExec({ kind: "success", output: body.output, output_type: body.output_type });
      await cleanupUploads();
      return;
    }

    const code = body?.error_code ?? "internal_error";
    if (code === "invalid_input" || code === "content_policy_violation") {
      setExec({
        kind: "error",
        message: "✗ Invalid Input — Your agent rejected the inputs. Adjust your test values and try again.",
      });
      await cleanupUploads();
      return;
    }
    if (code === "external_service_failure") {
      setExec({
        kind: "error",
        message:
          "✗ External Service Failure — A third party service your agent depends on failed. Check your API integrations.",
      });
      await cleanupUploads();
      return;
    }
    if (code === "internal_error") {
      setExec({
        kind: "error",
        message:
          "✗ Internal Error — Your endpoint returned an internal_error. Check your workflow logs for what went wrong.",
      });
      await cleanupUploads();
      return;
    }
    setExec({
      kind: "error",
      message:
        "✗ Malformed Response — Your endpoint's response did not match the Tasqr spec. Check the required response format in your seller documentation.",
      showDocsLink: true,
    });
    await cleanupUploads();
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
        <div className="h-8 w-1/3 bg-[#334155] animate-pulse rounded-[4px]" />
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 text-center">
        <p className="font-sans text-sm text-muted-foreground">Agent not found.</p>
      </div>
    );
  }

  const proc = processingCopy(agent.processing_time);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10 space-y-6">
      <Link to="/seller/agents/$id/edit" params={{ id }}>
        <Button variant="secondary" size="sm">← Back to Edit Agent</Button>
      </Link>

      <div>
        <h2 className="font-mono text-[24px] text-foreground">Test Agent</h2>
        <p className="font-sans text-sm text-muted-foreground mt-1">
          Test your agent without affecting your reliability score, earnings, or analytics.
          Disputes, ratings, and refunds are disabled in test mode.
        </p>
      </div>

      <div
        className="bg-[#1E293B] rounded-[4px] px-4 py-3"
        style={{ border: `1px solid ${WARN}` }}
      >
        <p className="font-sans text-sm" style={{ color: WARN }}>
          ⚠ TEST MODE — This run is not recorded and has no effect on your agent's performance
          metrics or reliability score.
        </p>
      </div>

      <section className="space-y-2">
        <h2 className="font-mono text-[20px] text-foreground">{agent.name}</h2>
        <p className="font-sans text-sm text-muted-foreground">{agent.short_description}</p>
        <p className="font-sans text-xs text-muted-foreground">Typical response: {proc.label}</p>
      </section>

      <section className="space-y-4">
        <div className={LABEL}>Your test inputs</div>
        {inputs.length === 0 && (
          <p className="font-sans text-sm text-muted-foreground">
            This agent does not need any inputs.
          </p>
        )}
        {inputs.map((f) => {
          const t = (f.type ?? "text").toLowerCase();
          const err = errors[f.field_name];
          const upErr = uploadErrors[f.field_name];
          const isUp = uploading[f.field_name];
          const label = (
            <label className="block font-mono text-xs text-foreground mb-1.5">
              {f.label ?? f.field_name}
              {f.required && <span className="text-destructive ml-1">*</span>}
            </label>
          );
          return (
            <div key={f.field_name}>
              {label}
              {t === "textarea" && (
                <textarea
                  value={values[f.field_name] ?? ""}
                  onChange={(e) => setVal(f.field_name, e.target.value)}
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
                  value={values[f.field_name] ?? ""}
                  onChange={(e) => setVal(f.field_name, e.target.value)}
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
                  {isUp ? (
                    <div className="w-full bg-surface-raised border border-border rounded-[4px] px-3 py-2 flex items-center gap-3">
                      <div className="flex-1 h-2 bg-background rounded-[4px] overflow-hidden">
                        <div className="h-full w-1/2 bg-primary animate-pulse" />
                      </div>
                      <span className="font-mono text-xs text-muted-foreground">Uploading</span>
                    </div>
                  ) : (
                    <input
                      type="file"
                      accept={
                        t === "image_upload"
                          ? IMG_EXTS.map((e) => "." + e).join(",")
                          : DOC_EXTS.map((e) => "." + e).join(",")
                      }
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleUpload(f, file);
                      }}
                      className={cn(
                        "w-full bg-surface-raised border rounded-[4px] px-3 py-2 font-sans text-sm text-foreground file:mr-3 file:py-1 file:px-2 file:rounded-[4px] file:border-0 file:bg-primary file:text-primary-foreground file:font-mono file:text-xs",
                        err || upErr ? "border-destructive" : "border-border",
                      )}
                    />
                  )}
                  {!isUp && files[f.field_name] && (
                    <p className="font-mono text-xs text-muted-foreground truncate">
                      Uploaded: {files[f.field_name].name}
                    </p>
                  )}
                  {upErr && (
                    <p className="font-sans text-xs" style={{ color: SAFETY_ORANGE }}>
                      {upErr}
                    </p>
                  )}
                </div>
              )}
              {(t === "text" ||
                (t !== "textarea" &&
                  t !== "dropdown" &&
                  t !== "image_upload" &&
                  t !== "document_upload")) && (
                <input
                  type="text"
                  value={values[f.field_name] ?? ""}
                  onChange={(e) => setVal(f.field_name, e.target.value)}
                  placeholder={f.placeholder}
                  className={cn(
                    "w-full bg-surface-raised border rounded-[4px] px-3 py-2 font-sans text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary",
                    err ? "border-destructive" : "border-border",
                  )}
                />
              )}
              {err && (
                <p className="font-mono text-xs text-destructive mt-1">
                  This field is required.
                </p>
              )}
            </div>
          );
        })}

        <button
          onClick={runTest}
          disabled={!canRun}
          className={cn(
            "w-full font-mono text-sm py-3 rounded-[4px] transition-colors",
            canRun
              ? "bg-primary text-primary-foreground hover:bg-primary/90"
              : "bg-muted text-muted-foreground cursor-not-allowed",
          )}
        >
          {exec.kind === "running" ? "Running…" : "Run Test"}
        </button>
      </section>

      <section className="space-y-4">
        {exec.kind === "running" && (
          <div className="bg-surface-raised border border-border rounded-[4px] p-6">
            <p className="font-sans text-sm text-muted-foreground">
              {proc.running}
              <Ellipsis />
            </p>
          </div>
        )}

        {exec.kind === "error" && (
          <div className="bg-surface-raised border border-border rounded-[4px] p-6 space-y-2">
            <p className="font-sans text-sm" style={{ color: SAFETY_ORANGE }}>
              {exec.message}
            </p>
            {exec.showDocsLink && (
              <Link
                to="/seller/docs"
                className="font-mono text-xs text-primary hover:underline"
              >
                View response format docs →
              </Link>
            )}
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
            <p className="font-sans text-sm text-muted-foreground pt-2">
              Test completed successfully. This run was not recorded.
            </p>
          </>
        )}
      </section>
    </div>
  );
}

export const Route = createFileRoute("/seller/agents/$id/test")({
  head: () => ({ meta: [{ title: "Test Agent — Tasqr" }] }),
  component: () => (
    <RequireAuth>
      <RequireSellerMode>
        <AppShell>
          <TestAgentInner />
        </AppShell>
      </RequireSellerMode>
    </RequireAuth>
  ),
});