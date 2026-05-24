import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import ReactMarkdown from "react-markdown";
import { Download } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { RequireAuth } from "@/components/auth/require-auth";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { notifyDisputeForRun } from "@/lib/email.functions";

type Run = {
  id: string;
  status: string;
  output: string | null;
  output_type: string | null;
  error_message: string | null;
  inputs: Record<string, unknown> | null;
  created_at: string;
  transaction_id: string | null;
  buyer_id: string;
  agent: { name: string; slug: string | null } | null;
};

type Tx = {
  id: string;
  status: string;
  dispute_window_ends: string | null;
  dispute_window_closed: boolean | null;
};

const LABEL = "font-mono text-[11px] uppercase tracking-[0.05em] text-muted-foreground";

function RunDetail({ id }: { id: string }) {
  const { user } = useAuth();
  const [run, setRun] = useState<Run | null>(null);
  const [tx, setTx] = useState<Tx | null>(null);
  const [existingDispute, setExistingDispute] = useState(false);
  const [loading, setLoading] = useState(true);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [outputExpired, setOutputExpired] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("runs")
        .select(
          "id,status,output,output_type,error_message,inputs,created_at,transaction_id,buyer_id,agent:agents(name,slug)",
        )
        .eq("id", id)
        .maybeSingle();
      const r = (data as unknown as Run) ?? null;
      setRun(r);

      if (r?.transaction_id) {
        const { data: t } = await supabase
          .from("transactions")
          .select("id,status,dispute_window_ends,dispute_window_closed")
          .eq("id", r.transaction_id)
          .maybeSingle();
        setTx((t as Tx) ?? null);
      }

      if (r) {
        const { data: d } = await supabase
          .from("disputes")
          .select("id")
          .eq("run_id", r.id)
          .maybeSingle();
        if (d) setExistingDispute(true);
      }

      if (
        r &&
        r.status === "success" &&
        r.output &&
        (r.output_type === "image_url" || r.output_type === "document_url")
      ) {
        const path = r.output;
        const { data: signed, error } = await supabase.storage
          .from("run-outputs")
          .createSignedUrl(path, 60 * 60 * 72);
        if (signed?.signedUrl && !error) {
          setSignedUrl(signed.signedUrl);
        } else {
          setOutputExpired(true);
        }
      }
      setLoading(false);
    })();
  }, [id]);

  const windowOpen =
    !!tx &&
    !tx.dispute_window_closed &&
    !!tx.dispute_window_ends &&
    new Date(tx.dispute_window_ends).getTime() > Date.now();

  const canRaise = windowOpen && !existingDispute && !submitted;

  const submitDispute = async () => {
    if (!run || !user || !tx) return;
    if (!reason.trim()) return;
    setSubmitting(true);
    const { error: dErr } = await (supabase as any).rpc("raise_dispute", {
      _run_id: run.id,
      _reason: reason.trim(),
    });
    setSubmitting(false);
    if (dErr) return;
    setSubmitted(true);
    setShowForm(false);
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-8 py-10">
        <div className="h-8 w-1/3 bg-[#334155] animate-pulse rounded-[4px]" />
      </div>
    );
  }
  if (!run) {
    return (
      <div className="max-w-4xl mx-auto px-8 py-24 text-center">
        <p className="font-sans text-sm text-muted-foreground">Run not found.</p>
      </div>
    );
  }

  const isFileOutput =
    run.output_type === "image_url" || run.output_type === "document_url";
  const fileUrl = signedUrl;

  return (
    <div className="max-w-4xl mx-auto px-8 py-10 space-y-6">
      <div className="space-y-1">
        <Link to="/runs" className="font-mono text-xs text-muted-foreground hover:text-foreground">
          ← My Runs
        </Link>
        <h1 className="font-mono text-[24px] text-foreground">
          {run.agent?.name ?? "Run"}
        </h1>
        <p className="font-mono text-xs text-muted-foreground">
          {new Date(run.created_at).toLocaleString()} · {run.status}
        </p>
      </div>

      {run.status === "success" && run.output && run.output_type && (
        <section className="space-y-2">
          <div className={LABEL}>Result</div>
          {run.output_type === "text" && (
            <pre className="bg-[#0B0E14] border border-[#334155] text-foreground rounded-[4px] p-4 font-sans text-sm whitespace-pre-wrap break-words">
              {run.output}
            </pre>
          )}
          {run.output_type === "markdown" && (
            <div className="bg-[#0B0E14] border border-[#334155] text-foreground rounded-[4px] p-4 prose prose-invert prose-sm max-w-none">
              <ReactMarkdown>{run.output}</ReactMarkdown>
            </div>
          )}
          {isFileOutput && outputExpired && (
            <p className="font-sans text-sm text-muted-foreground">
              Output expired. Files are available for 72 hours after delivery.
            </p>
          )}
          {run.output_type === "image_url" && fileUrl && (
            <div className="space-y-2">
              <img
                src={fileUrl}
                alt="Result"
                className="w-full rounded-[4px] border border-[#334155]"
              />
              <a
                href={fileUrl}
                download
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-2 font-mono text-xs px-3 py-2 rounded-[4px] border border-border text-foreground hover:bg-white/5"
              >
                <Download className="h-3.5 w-3.5" /> Download
              </a>
            </div>
          )}
          {run.output_type === "document_url" && fileUrl && (
            <a
              href={fileUrl}
              download
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-2 bg-primary text-primary-foreground font-mono text-sm px-4 py-2.5 rounded-[4px] hover:bg-primary/90"
            >
              <Download className="h-4 w-4" /> Download Document
            </a>
          )}
        </section>
      )}

      {run.status === "success" && (
        <section className="space-y-3 pt-2">
          {submitted || existingDispute ? (
            <p className="font-sans text-sm text-muted-foreground">
              Your dispute has been submitted. We will review it within 24 hours.
            </p>
          ) : (
            <>
              {canRaise && !showForm && (
                <button
                  onClick={() => setShowForm(true)}
                  className="font-sans text-sm text-muted-foreground hover:text-foreground underline underline-offset-2"
                >
                  Not satisfied with this result? Raise a dispute
                </button>
              )}
              {canRaise && showForm && (
                <div className="bg-surface-raised border border-border rounded-[4px] p-5 space-y-3">
                  <div className={LABEL}>Raise a dispute</div>
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Describe what went wrong with this result"
                    rows={4}
                    className="w-full bg-background border border-border rounded-[4px] px-3 py-2 font-sans text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
                  />
                  <div className="flex items-center gap-3">
                    <button
                      onClick={submitDispute}
                      disabled={submitting || !reason.trim()}
                      className={cn(
                        "font-mono text-sm px-4 py-2 rounded-[4px]",
                        reason.trim() && !submitting
                          ? "bg-primary text-primary-foreground hover:bg-primary/90"
                          : "bg-muted text-muted-foreground cursor-not-allowed",
                      )}
                    >
                      {submitting ? "Submitting…" : "Submit Dispute"}
                    </button>
                    <button
                      onClick={() => {
                        setShowForm(false);
                        setReason("");
                      }}
                      className="font-mono text-xs text-muted-foreground hover:text-foreground"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </section>
      )}

      {run.status !== "success" && run.error_message && (
        <p className={cn("font-sans text-sm text-destructive")}>{run.error_message}</p>
      )}
    </div>
  );
}

export const Route = createFileRoute("/runs/$id")({
  head: () => ({ meta: [{ title: "Run — Tasqr" }] }),
  component: RouteComponent,
});

function RouteComponent() {
  const { id } = Route.useParams();
  return (
    <RequireAuth>
      <AppShell>
        <RunDetail id={id} />
      </AppShell>
    </RequireAuth>
  );
}
