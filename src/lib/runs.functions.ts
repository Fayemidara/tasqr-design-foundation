import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Fetch a seller's output URL and cache it in the private `run-outputs`
 * bucket at `{buyer_id}/{run_id}/output`. Returns the storage path.
 *
 * The buyer is the currently signed-in user; we verify they own the run.
 */
export const cacheRunOutput = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        runId: z.string().uuid(),
        sourceUrl: z.string().url().max(2048),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;

    const { data: run, error: runErr } = await supabaseAdmin
      .from("runs")
      .select("id,buyer_id")
      .eq("id", data.runId)
      .maybeSingle();
    if (runErr) throw new Error(runErr.message);
    if (!run || run.buyer_id !== userId) throw new Error("forbidden");

    const res = await fetch(data.sourceUrl);
    if (!res.ok) throw new Error(`fetch_failed_${res.status}`);
    const buf = new Uint8Array(await res.arrayBuffer());
    const contentType = res.headers.get("content-type") ?? "application/octet-stream";

    const path = `${userId}/${data.runId}/output`;
    const { error: upErr } = await supabaseAdmin.storage
      .from("run-outputs")
      .upload(path, buf, { contentType, upsert: true });
    if (upErr) throw new Error(upErr.message);

    return { path };
  });
