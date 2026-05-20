import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import ReactMarkdown from "react-markdown";
import { Download } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { RequireAuth } from "@/components/auth/require-auth";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

type Run = {
  id: string;
  status: string;
  output: string | null;
  output_type: string | null;
  error_message: string | null;
  inputs: Record<string, unknown> | null;
  created_at: string;
  agent: { name: string; slug: string | null } | null;
};

const LABEL = "font-mono text-[11px] uppercase tracking-[0.05em] text-muted-foreground";

function RunDetail({ id }: { id: string }) {
  const [run, setRun] = useState<Run | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("runs")
        .select(
          "id,status,output,output_type,error_message,inputs,created_at,agent:agents(name,slug)",
        )
        .eq("id", id)
        .maybeSingle();
      setRun((data as unknown as Run) ?? null);
      setLoading(false);
    })();
  }, [id]);

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
          {run.output_type === "image_url" && (
            <div className="space-y-2">
              <img
                src={run.output}
                alt="Result"
                className="w-full rounded-[4px] border border-[#334155]"
              />
              <a
                href={run.output}
                download
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-2 font-mono text-xs px-3 py-2 rounded-[4px] border border-border text-foreground hover:bg-white/5"
              >
                <Download className="h-3.5 w-3.5" /> Download
              </a>
            </div>
          )}
          {run.output_type === "document_url" && (
            <a
              href={run.output}
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
