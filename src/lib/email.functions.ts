import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const SITE_NAME = "Tasqr";

// Shared styled HTML wrapper — Ink Black bg, Off-White text, IBM Plex Mono header.
function wrap(opts: { heading: string; bodyHtml: string }) {
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#0B0E14;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0B0E14;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#0B0E14;border:1px solid #1F2937;border-radius:4px;padding:32px;">
        <tr><td style="font-family:'IBM Plex Mono',ui-monospace,monospace;font-size:14px;letter-spacing:0.05em;color:#E2E8F0;padding-bottom:24px;">${SITE_NAME.toUpperCase()}</td></tr>
        <tr><td style="font-family:'IBM Plex Mono',ui-monospace,monospace;font-size:18px;color:#E2E8F0;padding-bottom:16px;">${opts.heading}</td></tr>
        <tr><td style="font-family:'Public Sans',Arial,sans-serif;font-size:14px;line-height:1.6;color:#E2E8F0;">${opts.bodyHtml}</td></tr>
        <tr><td style="font-family:'Public Sans',Arial,sans-serif;font-size:12px;color:#94A3B8;padding-top:32px;">— The ${SITE_NAME} Team</td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

async function sendMail(opts: {
  to: string;
  subject: string;
  text: string;
  html: string;
}) {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) {
    throw new Error("GMAIL_USER / GMAIL_APP_PASSWORD not configured");
  }
  const nodemailer = (await import("nodemailer")).default;
  const transport = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user, pass },
  });
  await transport.sendMail({
    from: user,
    to: opts.to,
    subject: opts.subject,
    text: opts.text,
    html: opts.html,
  });
}

// --- 1. Payout email (admin-triggered) ----------------------------------
export const sendPayoutEmail = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        seller_handle: z.string().min(1).max(200),
        seller_email: z.string().email(),
        amount: z.number().nonnegative(),
        airtm_email: z.string().email(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    try {
      const amount = data.amount.toFixed(2);
      const text = `Hi ${data.seller_handle},\n\nYour ${SITE_NAME} payout of $${amount} has been processed and sent to your AirTM account (${data.airtm_email}).\n\nIf you don't see it within 24 hours, check your AirTM account or reply to this email.\n\n— The ${SITE_NAME} Team`;
      const html = wrap({
        heading: `Payout sent: <span style="font-family:'IBM Plex Mono',monospace;">$${amount}</span>`,
        bodyHtml: `<p style="margin:0 0 16px;">Hi ${data.seller_handle},</p>
          <p style="margin:0 0 16px;">Your ${SITE_NAME} payout of <strong style="font-family:'IBM Plex Mono',monospace;">$${amount}</strong> has been processed and sent to your AirTM account (<span style="font-family:'IBM Plex Mono',monospace;">${data.airtm_email}</span>).</p>
          <p style="margin:0;">If you don't see it within 24 hours, check your AirTM account or reply to this email.</p>`,
      });
      await sendMail({
        to: data.seller_email,
        subject: `Your ${SITE_NAME} payout has been sent`,
        text,
        html,
      });
      return { success: true as const };
    } catch (err) {
      return { success: false as const, error: (err as Error).message };
    }
  });

// --- 2. Dispute notification (buyer-triggered) --------------------------
export const sendDisputeNotification = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        seller_email: z.string().email(),
        seller_handle: z.string().min(1).max(200),
        agent_name: z.string().min(1).max(300),
        dispute_reason: z.string().min(1).max(5000),
        buyer_id: z.string().min(1).max(200),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    try {
      const text = `Hi ${data.seller_handle},\n\nA buyer has raised a dispute against your agent '${data.agent_name}'.\n\nTheir reason: ${data.dispute_reason}\n\n${SITE_NAME} will review this dispute and reach out within 24 hours. No action is needed from you right now.\n\n— The ${SITE_NAME} Team`;
      const safeReason = data.dispute_reason
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
      const html = wrap({
        heading: "Dispute raised",
        bodyHtml: `<p style="margin:0 0 16px;">Hi ${data.seller_handle},</p>
          <p style="margin:0 0 16px;">A buyer has raised a dispute against your agent <strong>'${data.agent_name}'</strong>.</p>
          <p style="margin:0 0 16px;color:#94A3B8;">Their reason:</p>
          <p style="margin:0 0 16px;padding:12px;border-left:2px solid #F4511E;background:#111827;">${safeReason}</p>
          <p style="margin:0;">${SITE_NAME} will review this dispute and reach out within 24 hours. No action is needed from you right now.</p>`,
      });
      await sendMail({
        to: data.seller_email,
        subject: `A buyer has raised a dispute on ${SITE_NAME}`,
        text,
        html,
      });
      return { success: true as const };
    } catch (err) {
      return { success: false as const, error: (err as Error).message };
    }
  });

// --- 3. Agent paused (low reliability) ----------------------------------
export const sendAgentPausedEmail = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        seller_email: z.string().email(),
        seller_handle: z.string().min(1).max(200),
        reliability_score: z.number().min(0).max(100),
        paused_agent_count: z.number().int().nonnegative(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    try {
      const supportEmail = process.env.GMAIL_USER ?? "";
      const score = Math.round(data.reliability_score);
      const text = `Hi ${data.seller_handle},\n\nYour reliability score has dropped to ${score}/100. As a result, ${data.paused_agent_count} of your agents have been automatically paused.\n\nThis happens when your agents experience high timeout rates, errors, or buyer disputes.\n\nTo restore your agents, improve your agent's reliability and contact support at ${supportEmail}.\n\n— The ${SITE_NAME} Team`;
      const html = wrap({
        heading: `Agents paused: <span style="font-family:'IBM Plex Mono',monospace;">${score}/100</span>`,
        bodyHtml: `<p style="margin:0 0 16px;">Hi ${data.seller_handle},</p>
          <p style="margin:0 0 16px;">Your reliability score has dropped to <strong style="font-family:'IBM Plex Mono',monospace;">${score}/100</strong>. As a result, <strong>${data.paused_agent_count}</strong> of your agents have been automatically paused.</p>
          <p style="margin:0 0 16px;">This happens when your agents experience high timeout rates, errors, or buyer disputes.</p>
          <p style="margin:0;">To restore your agents, improve your agent's reliability and contact support at <a href="mailto:${supportEmail}" style="color:#3B82F6;">${supportEmail}</a>.</p>`,
      });
      await sendMail({
        to: data.seller_email,
        subject: `Your ${SITE_NAME} agents have been paused`,
        text,
        html,
      });
      return { success: true as const };
    } catch (err) {
      return { success: false as const, error: (err as Error).message };
    }
  });

// ============ Dispatcher serverFns (resolve emails server-side) ============

async function getSellerEmail(seller_id: string): Promise<{ email: string | null; handle: string | null; airtm: string | null }> {
  const { data: sp } = await supabaseAdmin
    .from("seller_profiles")
    .select("user_id, handle, airtm_email")
    .eq("id", seller_id)
    .maybeSingle();
  if (!sp?.user_id) return { email: null, handle: sp?.handle ?? null, airtm: sp?.airtm_email ?? null };
  const { data: prof } = await supabaseAdmin
    .from("profiles")
    .select("email")
    .eq("id", sp.user_id)
    .maybeSingle();
  return { email: prof?.email ?? null, handle: sp.handle, airtm: sp.airtm_email };
}

// Admin -> payout email by seller_id (resolves email server-side).
export const notifyPayoutSent = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ seller_id: z.string().uuid(), amount: z.number().nonnegative() }).parse(input),
  )
  .handler(async ({ data }) => {
    try {
      const s = await getSellerEmail(data.seller_id);
      if (!s.email) return { success: false as const, error: "seller_email_not_found" };
      if (!s.airtm) return { success: false as const, error: "airtm_email_missing" };
      const amount = data.amount.toFixed(2);
      const handle = s.handle ?? "there";
      const text = `Hi ${handle},\n\nYour ${SITE_NAME} payout of $${amount} has been processed and sent to your AirTM account (${s.airtm}).\n\nIf you don't see it within 24 hours, check your AirTM account or reply to this email.\n\n— The ${SITE_NAME} Team`;
      const html = wrap({
        heading: `Payout sent: <span style="font-family:'IBM Plex Mono',monospace;">$${amount}</span>`,
        bodyHtml: `<p style="margin:0 0 16px;">Hi ${handle},</p>
          <p style="margin:0 0 16px;">Your ${SITE_NAME} payout of <strong style="font-family:'IBM Plex Mono',monospace;">$${amount}</strong> has been processed and sent to your AirTM account (<span style="font-family:'IBM Plex Mono',monospace;">${s.airtm}</span>).</p>
          <p style="margin:0;">If you don't see it within 24 hours, check your AirTM account or reply to this email.</p>`,
      });
      await sendMail({ to: s.email, subject: `Your ${SITE_NAME} payout has been sent`, text, html });
      return { success: true as const };
    } catch (err) {
      return { success: false as const, error: (err as Error).message };
    }
  });

// Buyer -> dispute notification for a run_id (resolves seller/agent server-side).
export const notifyDisputeForRun = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ run_id: z.string().uuid(), dispute_reason: z.string().min(1).max(5000), buyer_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }) => {
    try {
      const { data: run } = await supabaseAdmin
        .from("runs")
        .select("agent_id, agents:agent_id(name, seller_id)")
        .eq("id", data.run_id)
        .maybeSingle();
      const agent = (run as any)?.agents;
      if (!agent?.seller_id) return { success: false as const, error: "agent_not_found" };
      const s = await getSellerEmail(agent.seller_id);
      if (!s.email) return { success: false as const, error: "seller_email_not_found" };
      const handle = s.handle ?? "there";
      const reason = data.dispute_reason;
      const safeReason = reason.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const text = `Hi ${handle},\n\nA buyer has raised a dispute against your agent '${agent.name}'.\n\nTheir reason: ${reason}\n\n${SITE_NAME} will review this dispute and reach out within 24 hours. No action is needed from you right now.\n\n— The ${SITE_NAME} Team`;
      const html = wrap({
        heading: "Dispute raised",
        bodyHtml: `<p style="margin:0 0 16px;">Hi ${handle},</p>
          <p style="margin:0 0 16px;">A buyer has raised a dispute against your agent <strong>'${agent.name}'</strong>.</p>
          <p style="margin:0 0 16px;color:#94A3B8;">Their reason:</p>
          <p style="margin:0 0 16px;padding:12px;border-left:2px solid #F4511E;background:#111827;">${safeReason}</p>
          <p style="margin:0;">${SITE_NAME} will review this dispute and reach out within 24 hours. No action is needed from you right now.</p>`,
      });
      await sendMail({ to: s.email, subject: `A buyer has raised a dispute on ${SITE_NAME}`, text, html });
      return { success: true as const };
    } catch (err) {
      return { success: false as const, error: (err as Error).message };
    }
  });

// Run flow -> if reliability dropped below 50, notify seller of paused agents.
export const notifyIfAgentsPaused = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ seller_id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    try {
      const { data: sp } = await supabaseAdmin
        .from("seller_profiles")
        .select("reliability_score")
        .eq("id", data.seller_id)
        .maybeSingle();
      const score = Number(sp?.reliability_score ?? 100);
      if (score >= 50) return { success: true as const, skipped: true as const };
      const { count } = await supabaseAdmin
        .from("agents")
        .select("id", { count: "exact", head: true })
        .eq("seller_id", data.seller_id)
        .eq("status", "paused");
      const pausedCount = count ?? 0;
      if (pausedCount === 0) return { success: true as const, skipped: true as const };
      const s = await getSellerEmail(data.seller_id);
      if (!s.email) return { success: false as const, error: "seller_email_not_found" };
      const handle = s.handle ?? "there";
      const supportEmail = process.env.GMAIL_USER ?? "";
      const scoreInt = Math.round(score);
      const text = `Hi ${handle},\n\nYour reliability score has dropped to ${scoreInt}/100. As a result, ${pausedCount} of your agents have been automatically paused.\n\nThis happens when your agents experience high timeout rates, errors, or buyer disputes.\n\nTo restore your agents, improve your agent's reliability and contact support at ${supportEmail}.\n\n— The ${SITE_NAME} Team`;
      const html = wrap({
        heading: `Agents paused: <span style="font-family:'IBM Plex Mono',monospace;">${scoreInt}/100</span>`,
        bodyHtml: `<p style="margin:0 0 16px;">Hi ${handle},</p>
          <p style="margin:0 0 16px;">Your reliability score has dropped to <strong style="font-family:'IBM Plex Mono',monospace;">${scoreInt}/100</strong>. As a result, <strong>${pausedCount}</strong> of your agents have been automatically paused.</p>
          <p style="margin:0 0 16px;">This happens when your agents experience high timeout rates, errors, or buyer disputes.</p>
          <p style="margin:0;">To restore your agents, improve your agent's reliability and contact support at <a href="mailto:${supportEmail}" style="color:#3B82F6;">${supportEmail}</a>.</p>`,
      });
      await sendMail({ to: s.email, subject: `Your ${SITE_NAME} agents have been paused`, text, html });
      return { success: true as const };
    } catch (err) {
      return { success: false as const, error: (err as Error).message };
    }
  });
