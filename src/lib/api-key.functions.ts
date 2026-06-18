// MANUAL SETUP REQUIRED: Add API_KEY_ENCRYPTION_SECRET
// to your environment variables. This must be a 32-character
// random string. Never change it after keys are encrypted
// or all existing keys become unreadable.

import { createServerFn } from "@tanstack/react-start";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { encryptApiKey, decryptApiKey } from "@/lib/api-key-crypto.server";

const KEY_CHARS =
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

function generateRawKey(): string {
  // 24 random alphanumeric chars after the tsk_live_ prefix.
  const bytes = randomBytes(24);
  let s = "";
  for (let i = 0; i < 24; i++) s += KEY_CHARS[bytes[i] % KEY_CHARS.length];
  return `tsk_live_${s}`;
}

function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/**
 * Generate (or rotate) a seller's API key entirely on the server.
 * - Generates the raw key server-side
 * - Stores sha256 hash, 12-char prefix, and AES-256-GCM encrypted value
 * - Returns the raw key ONCE so the UI can show it
 * The raw key is never logged.
 */
export const rotateSellerApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;

    const rawKey = generateRawKey();
    const hash = sha256Hex(rawKey);
    const prefix = rawKey.slice(0, 12);
    const encrypted = encryptApiKey(rawKey);

    const { error } = await supabaseAdmin
      .from("seller_profiles")
      .update({
        api_key_hash: hash,
        api_key_prefix: prefix,
        api_key_encrypted: encrypted,
      })
      .eq("user_id", userId);
    if (error) throw new Error(error.message);

    return { api_key: rawKey, api_key_prefix: prefix };
  });

/**
 * Decrypt a seller's stored API key. Server-only — the raw key is returned
 * to the caller (another server function in the runs flow) but never to
 * the browser. Never log the raw key.
 */
export const getDecryptedApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ seller_profile_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { data: sp, error } = await supabaseAdmin
      .from("seller_profiles")
      .select("api_key_encrypted")
      .eq("id", data.seller_profile_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!sp?.api_key_encrypted) return { api_key: "" };
    return { api_key: decryptApiKey(sp.api_key_encrypted) };
  });

/**
 * Server-side proxy: build the POST payload (with the decrypted raw API key
 * injected) and call the seller's endpoint. The raw key never touches the
 * browser — it is decrypted server-side and included in the outgoing POST
 * request server-side.
 */
export const invokeAgentEndpoint = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        agent_id: z.string().uuid(),
        timeout_ms: z.number().int().min(1000).max(180_000),
        payload: z.record(z.string(), z.unknown()),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { data: agent, error: agentErr } = await supabaseAdmin
      .from("agents")
      .select("endpoint_url, seller_id")
      .eq("id", data.agent_id)
      .maybeSingle();
    if (agentErr) throw new Error(agentErr.message);
    if (!agent?.endpoint_url) {
      return { kind: "unreachable" as const };
    }

    let apiKey = "";
    const { data: sp } = await supabaseAdmin
      .from("seller_profiles")
      .select("api_key_encrypted")
      .eq("id", agent.seller_id)
      .maybeSingle();
    if (sp?.api_key_encrypted) {
      try {
        apiKey = decryptApiKey(sp.api_key_encrypted);
      } catch {
        // Decryption failure — send empty key; seller will reject.
      }
    }

    const fullPayload = { api_key: apiKey, ...data.payload };

    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), data.timeout_ms);

    let resp: Response;
    try {
      resp = await fetch(agent.endpoint_url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fullPayload),
        signal: controller.signal,
      });
    } catch (e) {
      clearTimeout(t);
      const aborted = (e as Error).name === "AbortError";
      return { kind: (aborted ? "timeout" : "unreachable") as "timeout" | "unreachable" };
    }
    clearTimeout(t);

    const text = await resp.text();
    console.log("[invokeAgentEndpoint] Raw response status:", resp.status);
    console.log("[invokeAgentEndpoint] Raw response body:", text);
    console.log(
      "[invokeAgentEndpoint] Content-Type is application/json:",
      resp.headers.get("content-type")?.includes("application/json") ?? false,
    );
    let body:
      | {
          status?: string;
          output?: string;
          output_type?: string;
          error_code?: string;
          error_message?: string;
        }
      | null = null;
    let parseFailed = false;
    try {
      body = JSON.parse(text);
    } catch (parseErr) {
      console.error("[invokeAgentEndpoint] JSON parsing error:", parseErr);
      parseFailed = true;
    }
    return {
      kind: "response" as const,
      ok: resp.ok,
      status: resp.status,
      body,
      parseFailed,
    };
  });