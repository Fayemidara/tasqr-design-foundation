import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import ReactMarkdown from "react-markdown";
import { Star, Download } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { RequireAuth } from "@/components/auth/require-auth";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { cacheRunOutput } from "@/lib/runs.functions";
import { invokeAgentEndpoint } from "@/lib/api-key.functions";
import {
  notifyDisputeForRun,
  notifyIfAgentsPaused,
  pauseAndNotifySubscribers,
} from "@/lib/email.functions";

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
  slug: string | null;
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
  | { kind: "error"; message: string; refundable: boolean };

type RepeatedPromptState =
  | { kind: "hidden" }
  | { kind: "open" }
  | { kind: "cancelling" }
  | { kind: "cancelled"; amount: number }
  | { kind: "kept" };

const LABEL = "font-mono text-[11px] uppercase tracking-[0.05em] text-muted-foreground";
const SAFETY_ORANGE = "#F4511E";

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

function validateFile(file: File, kind: "image_upload" | "document_upload"): string | null {
  const ext = (file.name.split(".").pop() ?? "").toLowerCase();
  if (kind === "image_upload") {
    const okType =
      IMG_EXTS.includes(ext) || (file.type && IMG_MIMES.includes(file.type));
    if (!okType) return "Invalid file type.";
    if (file.size > MAX_IMG) return "File too large. Maximum size is 10mb.";
  } else {
    const okType =
      DOC_EXTS.includes(ext) || (file.type && DOC_MIMES.includes(file.type));
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

function RunNewInner() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const cacheOutput = useServerFn(cacheRunOutput);
  const invokeAgent = useServerFn(invokeAgentEndpoint);
  const notifyDispute = useServerFn(notifyDisputeForRun);
  const notifyPaused = useServerFn(notifyIfAgentsPaused);
  const pauseSubscribers = useServerFn(pauseAndNotifySubscribers);

  const params =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search)
      : new URLSearchParams();
  const slugOrId = params.get("agent") ?? "";
  const transactionParam = params.get("transaction") ?? "";
  const subscriptionParam = params.get("subscription") ?? "";

  // Stable request id for this run session — used for storage path.
  const requestIdRef = useRef<string>(randomId());

  const [agent, setAgent] = useState<AgentRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [transactionId, setTransactionId] = useState<string | null>(null);
  const [txAmount, setTxAmount] = useState<number>(0);
  const [subscriptionId, setSubscriptionId] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [files, setFiles] = useState<Record<string, FileEntry>>({});
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const [uploadErrors, setUploadErrors] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, boolean>>({});
  const [exec, setExec] = useState<ExecState>({ kind: "idle" });
  const [runId, setRunId] = useState<string | null>(null);
  const [repeated, setRepeated] = useState<RepeatedPromptState>({ kind: "hidden" });

  // review UI
  const [rating, setRating] = useState(0);
  const [reviewText, setReviewText] = useState("");
  const [reviewState, setReviewState] = useState<"prompt" | "submitted" | "skipped">("prompt");

  // dispute UI
  const [disputeTx, setDisputeTx] = useState<{
    id: string;
    dispute_window_ends: string | null;
    dispute_window_closed: boolean;
  } | null>(null);
  const [disputeShow, setDisputeShow] = useState(false);
  const [disputeReason, setDisputeReason] = useState("");
  const [disputeSubmitting, setDisputeSubmitting] = useState(false);
  const [disputeSubmitted, setDisputeSubmitted] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const query = supabase
        .from("agents")
        .select(
          "id,slug,name,short_description,processing_time,input_schema,seller_id",
        );
      const { data } = await (slugOrId.length === 36
        ? query.eq("id", slugOrId).maybeSingle()
        : query.eq("slug", slugOrId).maybeSingle());
      if (cancelled) return;
      const ag = (data as unknown as AgentRow) ?? null;
      setAgent(ag);

      // Verify subscription param if present (takes precedence over transaction).
      if (subscriptionParam) {
        if (!ag || !user) {
          navigate({ to: "/browse" });
          return;
        }
        const { data: sub } = await supabase
          .from("subscriptions")
          .select("id, status, buyer_id, agent_id, current_period_end")
          .eq("id", subscriptionParam)
          .maybeSingle();
        if (
          !sub ||
          sub.buyer_id !== user.id ||
          sub.agent_id !== ag.id
        ) {
          navigate({ to: "/browse" });
          return;
        }
        const expired = new Date(sub.current_period_end as string).getTime() <= Date.now();
        if (sub.status !== "active" || expired) {
          navigate({
            to: "/agents/$slug",
            params: { slug: ag.slug ?? ag.id },
            search: { msg: "Your subscription has expired. Please renew to continue." } as never,
          });
          return;
        }
        setSubscriptionId(sub.id as string);
      } else if (transactionParam) {
        if (!ag || !user) {
          navigate({ to: "/browse" });
          return;
        }
        const { data: tx } = await supabase
          .from("transactions")
          .select("id, status, buyer_id, agent_id, amount")
          .eq("id", transactionParam)
          .maybeSingle();
        if (
          !tx ||
          tx.status !== "held" ||
          tx.buyer_id !== user.id ||
          tx.agent_id !== ag.id
        ) {
          navigate({ to: "/browse" });
          return;
        }
        setTransactionId(tx.id);
        setTxAmount(Number((tx as { amount?: number }).amount ?? 0));
      }

      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [slugOrId, transactionParam, subscriptionParam, user, navigate]);

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

    // Clear prior state for this field
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
      const { error } = await supabase.storage
        .from("run-uploads")
        .upload(path, file, {
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

  const runAgent = async () => {
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

    // Reset repeated-failures prompt for this new attempt.
    setRepeated({ kind: "hidden" });

    const tasqr_request_id = requestIdRef.current;
    const inputsPayload: Record<string, string> = {};
    const filesPathPayload: Record<string, string> = {};
    const filesSignedPayload: Record<string, string> = {};

    for (const f of inputs) {
      const t = (f.type ?? "text").toLowerCase();
      if (t === "image_upload" || t === "document_upload") {
        const entry = files[f.field_name];
        if (!entry) continue;
        filesPathPayload[f.field_name] = entry.path;
        const { data: signed, error: signErr } = await supabase.storage
          .from("run-uploads")
          .createSignedUrl(entry.path, 60 * 30);
        if (signErr || !signed?.signedUrl) {
          setExec({
            kind: "error",
            message: "Could not prepare your files for the agent. Please try again.",
            refundable: false,
          });
          return;
        }
        filesSignedPayload[f.field_name] = signed.signedUrl;
      } else if (values[f.field_name] != null) {
        inputsPayload[f.field_name] = values[f.field_name];
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
        files: filesPathPayload,
        status: "processing",
        transaction_id: transactionId,
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

    // Server-side proxy injects the decrypted api_key into the payload
    // before POSTing to the seller's endpoint. The raw key never touches
    // the browser.
    const payload = {
      tasqr_request_id,
      inputs: inputsPayload,
      files: filesSignedPayload,
      buyer_id: user.id,
      timestamp: new Date().toISOString(),
    };

    const started = Date.now();

    type RunUpdate = Database["public"]["Tables"]["runs"]["Update"];
    const isSubscription = !!subscriptionId;
    // Admin note: refunded transactions are identified by
    // transactions.status = 'refunded' and can be exported for manual
    // Paystack processing.
    const refundIfNeeded = async () => {
      // Subscriptions never auto-refund on a single failed run.
      if (isSubscription) return;
      if (!transactionId) return;
      await supabase.rpc("trigger_refund", { _transaction_id: transactionId });
    };
    const subFailureMessage = (code: string): string => {
      const tail =
        " Your subscription is still active — please try again in a few minutes.";
      if (code === "timeout") return "The agent took too long to respond." + tail;
      if (code === "unreachable") return "The agent could not be reached." + tail;
      if (code === "malformed")
        return "The agent returned an invalid response." + tail;
      return "Something went wrong on the agent's side." + tail;
    };
    const handleSubscriptionFailure = async (code: string) => {
      if (!subscriptionId) return;
      try {
        const { data: newCount } = await (supabase as any).rpc(
          "increment_subscription_failures",
          { _sub_id: subscriptionId },
        );
        const n = Number(newCount ?? 0);
        if (n >= 3) setRepeated({ kind: "open" });
      } catch (e) {
        console.error("increment_subscription_failures failed", e);
      }
    };
    const resetSubscriptionFailures = async () => {
      if (!subscriptionId) return;
      try {
        await (supabase as any).rpc("reset_subscription_failures", {
          _sub_id: subscriptionId,
        });
      } catch (e) {
        console.error("reset_subscription_failures failed", e);
      }
    };
    const finalize = async (
      patch: RunUpdate,
      execState: ExecState,
      refund = false,
    ) => {
      await (supabase as any).rpc("complete_run", {
        _run_id: inserted.id,
        _status: patch.status,
        _output: patch.output ?? null,
        _output_type: patch.output_type ?? null,
        _error_message: patch.error_message ?? null,
        _error_code: patch.error_code ?? null,
        _processing_time_ms: patch.processing_time_ms ?? null,
        _files: (patch.files as never) ?? null,
        _subscription_id: subscriptionId ?? null,
      });
      if (refund) await refundIfNeeded();
      const finalStatuses = ["success", "timeout", "unreachable", "error", "malformed"];
      if (patch.status && finalStatuses.includes(patch.status)) {
        try {
          await supabase.rpc("calculate_reliability_score", { _agent_id: agent.id });
        } catch {
          // ignore
        }
        // Non-blocking: notify seller if THIS agent was paused due to low score,
        // and pause/notify every active subscriber on this agent.
        notifyPaused({ data: { seller_id: agent.seller_id, agent_id: agent.id } })
          .then(() => {
            pauseSubscribers({ data: { agent_id: agent.id } }).catch((e) =>
              console.error("pause-subscribers email failed", e),
            );
          })
          .catch((e) => console.error("agent-paused email failed", e));
      }
      setExec(execState);
      await cleanupUploads();
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
      const message = isSubscription
        ? subFailureMessage("unreachable")
        : `The agent could not be reached. A full refund of $${txAmount.toFixed(2)} will be returned to your original payment method. Refunds are processed every Friday. Please allow an additional 3-5 bank working days for your card issuer to credit your statement.`;
      await finalize(
        {
          status: "unreachable",
          error_message: message,
          error_code: "unreachable",
          processing_time_ms: Date.now() - started,
        },
        { kind: "error", message, refundable: !isSubscription },
        !isSubscription,
      );
      if (isSubscription) await handleSubscriptionFailure("unreachable");
      return;
    }

    if (invokeResult.kind === "timeout" || invokeResult.kind === "unreachable") {
      const aborted = invokeResult.kind === "timeout";
      const amt = txAmount.toFixed(2);
      const message = isSubscription
        ? subFailureMessage(aborted ? "timeout" : "unreachable")
        : aborted
        ? `The agent took too long to respond. A full refund of $${amt} will be returned to your original payment method. Refunds are processed every Friday.`
        : `The agent could not be reached. A full refund of $${amt} will be returned to your original payment method. Refunds are processed every Friday. Please allow an additional 3-5 bank working days for your card issuer to credit your statement.`;
      await finalize(
        {
          status: invokeResult.kind,
          error_message: message,
          error_code: invokeResult.kind,
          processing_time_ms: Date.now() - started,
        },
        { kind: "error", message, refundable: !isSubscription },
        !isSubscription,
      );
      if (isSubscription) await handleSubscriptionFailure(invokeResult.kind);
      return;
    }

    if (invokeResult.parseFailed) {
      const message = isSubscription
        ? subFailureMessage("malformed")
        : `The agent returned an invalid response. A full refund of $${txAmount.toFixed(2)} will be returned to your original payment method. Refunds are processed every Friday. Please allow an additional 3-5 bank working days for your card issuer to credit your statement.`;
      await finalize(
        {
          status: "malformed",
          error_message: message,
          error_code: "malformed",
          processing_time_ms: Date.now() - started,
        },
        { kind: "error", message, refundable: !isSubscription },
        !isSubscription,
      );
      if (isSubscription) await handleSubscriptionFailure("malformed");
      return;
    }

    const body = invokeResult.body;
    const processing_time_ms = Date.now() - started;

    if (invokeResult.ok && body?.status === "success" && body.output && body.output_type) {
      const ot = body.output_type;
      let storedOutput = body.output;
      let displayOutput = body.output;

      // Cache image/document URLs in run-outputs and serve via signed URL
      if (ot === "image_url" || ot === "document_url") {
        try {
          const { path } = await cacheOutput({
            data: { runId: inserted.id, sourceUrl: body.output },
          });
          storedOutput = path;
          const { data: signed } = await supabase.storage
            .from("run-outputs")
            .createSignedUrl(path, 60 * 60 * 72);
          displayOutput = signed?.signedUrl ?? body.output;
        } catch (e) {
          console.error("output caching failed", e);
          // Fall back to seller's original URL; still record success.
        }
      }

      await finalize(
        {
          status: "success",
          output: storedOutput,
          output_type: ot,
          processing_time_ms,
        },
        { kind: "success", output: displayOutput, output_type: ot },
      );
      if (isSubscription) await resetSubscriptionFailures();
      // The 48-hour dispute window was opened by complete_run() server-side.
      // Resolve the tx id for local UI state.
      let disputeTxId: string | null = transactionId;
      if (!disputeTxId && subscriptionId) {
        const { data: sub } = await supabase
          .from("subscriptions")
          .select("transaction_id")
          .eq("id", subscriptionId)
          .maybeSingle();
        disputeTxId = (sub?.transaction_id as string | null) ?? null;
      }
      if (disputeTxId) {
        const ends = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
        setDisputeTx({
          id: disputeTxId,
          dispute_window_ends: ends,
          dispute_window_closed: false,
        });
      }
      return;
    }

    const code = body?.error_code ?? "internal_error";
    const sellerFault = code === "external_service_failure" || code === "internal_error";
    if (code === "invalid_input" || code === "content_policy_violation") {
      const message = body?.error_message ?? "Your input was rejected.";
      await finalize(
        {
          status: "error",
          error_code: code,
          error_message: message,
          processing_time_ms,
        },
        { kind: "error", message, refundable: false },
      );
      return;
    }

    if (sellerFault) {
      const amt = txAmount.toFixed(2);
      const message = isSubscription
        ? subFailureMessage(code)
        : code === "external_service_failure"
        ? `The agent's external service failed. A full refund of $${amt} will be returned to your original payment method. Refunds are processed every Friday. Please allow an additional 3-5 bank working days for your card issuer to credit your statement.`
        : `Something went wrong on the agent's side. A full refund of $${amt} will be returned to your original payment method. Refunds are processed every Friday. Please allow an additional 3-5 bank working days for your card issuer to credit your statement.`;
      await finalize(
        {
          status: "error",
          error_code: code,
          error_message: message,
          processing_time_ms,
        },
        { kind: "error", message, refundable: !isSubscription },
        !isSubscription,
      );
      if (isSubscription) await handleSubscriptionFailure(code);
      return;
    }

    // malformed shape
    const message = isSubscription
      ? subFailureMessage("malformed")
      : `The agent returned an invalid response. A full refund of $${txAmount.toFixed(2)} will be returned to your original payment method. Refunds are processed every Friday. Please allow an additional 3-5 bank working days for your card issuer to credit your statement.`;
    await finalize(
      {
        status: "malformed",
        error_code: "malformed",
        error_message: message,
        processing_time_ms,
      },
      { kind: "error", message, refundable: !isSubscription },
      !isSubscription,
    );
    if (isSubscription) await handleSubscriptionFailure("malformed");
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

  const cancelAndRefundSubscription = async () => {
    if (!subscriptionId) return;
    setRepeated({ kind: "cancelling" });
    try {
      const { data: sub } = await supabase
        .from("subscriptions")
        .select("transaction_id")
        .eq("id", subscriptionId)
        .maybeSingle();
      const txId = (sub?.transaction_id as string | null) ?? null;
      let amount = 0;
      if (txId) {
        const { data: tx } = await supabase
          .from("transactions")
          .select("amount")
          .eq("id", txId)
          .maybeSingle();
        amount = Number((tx as { amount?: number } | null)?.amount ?? 0);
      }
      await (supabase as any).rpc("cancel_subscription", { _sub_id: subscriptionId });
      if (txId) {
        await (supabase as any).rpc("trigger_refund", { _transaction_id: txId });
      }
      setRepeated({ kind: "cancelled", amount });
    } catch (e) {
      console.error("cancel subscription failed", e);
      setRepeated({ kind: "open" });
    }
  };

  const keepSubscription = async () => {
    setRepeated({ kind: "kept" });
    if (!subscriptionId) return;
    try {
      await (supabase as any).rpc("reset_subscription_failures", {
        _sub_id: subscriptionId,
      });
    } catch (e) {
      console.error("reset_subscription_failures failed", e);
    }
  };

  const submitDispute = async () => {
    if (!user || !runId || !disputeTx) return;
    if (!disputeReason.trim()) return;
    setDisputeSubmitting(true);
    const { error: dErr } = await (supabase as any).rpc("raise_dispute", {
      _run_id: runId,
      _reason: disputeReason.trim(),
    });
    setDisputeSubmitting(false);
    if (dErr) return;
    setDisputeSubmitted(true);
    setDisputeShow(false);
    setDisputeTx({ ...disputeTx, dispute_window_closed: true });
    // Non-blocking dispute email; log full response for debugging.
    notifyDispute({ data: { run_id: runId, dispute_reason: disputeReason.trim(), buyer_id: user.id } })
      .then((res) => console.log("dispute email response", res))
      .catch((e) => console.error("dispute email failed", e));
  };

  const disputeWindowOpen =
    !!disputeTx &&
    !disputeTx.dispute_window_closed &&
    !!disputeTx.dispute_window_ends &&
    new Date(disputeTx.dispute_window_ends).getTime() > Date.now();

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
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
      <div className="grid grid-cols-1 gap-6 lg:gap-8">
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
                          <span className="font-mono text-xs text-muted-foreground">
                            Uploading
                          </span>
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
                      {isUp && (
                        <p className="font-sans text-xs text-muted-foreground">
                          Uploading file...
                        </p>
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
          <div className="space-y-4">
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

            {exec.kind === "error" && subscriptionId && repeated.kind !== "hidden" && (
              <>
                {(repeated.kind === "open" || repeated.kind === "cancelling") && (
                  <div
                    className="bg-[#1E293B] rounded-[4px] p-4"
                    style={{ border: `1px solid ${SAFETY_ORANGE}` }}
                  >
                    <div
                      className="font-mono text-[11px] uppercase tracking-[0.05em]"
                      style={{ color: SAFETY_ORANGE }}
                    >
                      REPEATED FAILURES
                    </div>
                    <p className="font-sans text-sm text-foreground mt-2">
                      This agent has failed 3 times in a row. You can cancel your
                      subscription and receive a full refund if you no longer wish
                      to continue.
                    </p>
                    <div className="flex flex-wrap gap-3 mt-4">
                      <button
                        onClick={cancelAndRefundSubscription}
                        disabled={repeated.kind === "cancelling"}
                        className={cn(
                          "font-mono text-xs px-3 py-2 rounded-[4px] bg-primary text-primary-foreground hover:bg-primary/90",
                          repeated.kind === "cancelling" && "opacity-60 cursor-wait",
                        )}
                      >
                        {repeated.kind === "cancelling"
                          ? "Cancelling…"
                          : "Cancel & Get Full Refund"}
                      </button>
                      <button
                        onClick={keepSubscription}
                        disabled={repeated.kind === "cancelling"}
                        className="font-mono text-xs px-3 py-2 rounded-[4px] border border-border text-foreground hover:bg-white/5"
                      >
                        Keep Subscription
                      </button>
                    </div>
                  </div>
                )}
                {repeated.kind === "cancelled" && (
                  <div className="bg-surface-raised border border-border rounded-[4px] p-4">
                    <p className="font-sans text-sm" style={{ color: "#1976D2" }}>
                      Your subscription has been cancelled. A full refund of $
                      {repeated.amount.toFixed(2)} will be returned to your original
                      payment method. Refunds are processed every Friday.
                    </p>
                  </div>
                )}
                {repeated.kind === "kept" && (
                  <p className="font-sans text-sm text-muted-foreground">
                    Keeping your subscription. Please try running the agent again
                    later.
                  </p>
                )}
              </>
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

                {/* Dispute prompt */}
                {disputeSubmitted ? (
                  <p className="font-sans text-sm text-muted-foreground mt-4">
                    Your dispute has been submitted. We will review it within 24 hours.
                  </p>
                ) : (
                  disputeWindowOpen && (
                    <div className="mt-4 space-y-3">
                      {!disputeShow && (
                        <button
                          onClick={() => setDisputeShow(true)}
                          className="font-sans text-sm text-muted-foreground hover:text-foreground underline underline-offset-2"
                        >
                          Not satisfied with this result? Raise a dispute
                        </button>
                      )}
                      {disputeShow && (
                        <div className="bg-surface-raised border border-border rounded-[4px] p-5 space-y-3">
                          <div className={LABEL}>Raise a dispute</div>
                          <textarea
                            value={disputeReason}
                            onChange={(e) => setDisputeReason(e.target.value)}
                            placeholder="Describe what went wrong with this result"
                            rows={4}
                            className="w-full bg-background border border-border rounded-[4px] px-3 py-2 font-sans text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
                          />
                          <div className="flex items-center gap-3">
                            <button
                              onClick={submitDispute}
                              disabled={disputeSubmitting || !disputeReason.trim()}
                              className={cn(
                                "font-mono text-sm px-4 py-2 rounded-[4px]",
                                disputeReason.trim() && !disputeSubmitting
                                  ? "bg-primary text-primary-foreground hover:bg-primary/90"
                                  : "bg-muted text-muted-foreground cursor-not-allowed",
                              )}
                            >
                              {disputeSubmitting ? "Submitting…" : "Submit Dispute"}
                            </button>
                            <button
                              onClick={() => {
                                setDisputeShow(false);
                                setDisputeReason("");
                              }}
                              className="font-mono text-xs text-muted-foreground hover:text-foreground"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )
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
