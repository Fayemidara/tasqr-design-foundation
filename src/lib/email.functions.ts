import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const SITE_NAME = "Tasqr";

// Shared styled HTML wrapper — clean white professional design.
function wrap(opts: { heading: string; bodyHtml: string }) {
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#ffffff;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #eeeeee;border-radius:4px;padding:32px;">
        <tr><td style="font-family:'IBM Plex Mono',ui-monospace,monospace;font-size:14px;letter-spacing:0.05em;color:#111111;padding-bottom:24px;">${SITE_NAME.toUpperCase()}</td></tr>
        <tr><td style="font-family:'IBM Plex Mono',ui-monospace,monospace;font-size:18px;color:#111111;padding-bottom:16px;">${opts.heading}</td></tr>
        <tr><td style="font-family:'Public Sans',Arial,sans-serif;font-size:14px;line-height:1.6;color:#555555;">${opts.bodyHtml}</td></tr>
        <tr><td style="border-top:1px solid #eeeeee;padding-top:20px;font-family:'Public Sans',Arial,sans-serif;font-size:11px;color:#aaaaaa;">© 2026 Tasqr. The AI workflow marketplace.</td></tr>
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
    from: '"Tasqr" <' + user + '>',
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
          <p style="margin:0 0 16px;color:#777777;">Their reason:</p>
          <p style="margin:0 0 16px;padding:12px;border-left:2px solid #cccccc;">${safeReason}</p>
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
      return {
        success: false as const,
        error: (err as Error).message,
        gmailUserSet: !!process.env.GMAIL_USER,
        gmailPasswordSet: !!process.env.GMAIL_APP_PASSWORD,
      };
    }
  });

// --- 3. Agent paused (low reliability) ----------------------------------
export const sendAgentPausedEmail = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        seller_email: z.string().email(),
        seller_handle: z.string().min(1).max(200),
        agent_name: z.string().min(1).max(300),
        reliability_score: z.number().min(0).max(100),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    try {
      const supportEmail = process.env.GMAIL_USER ?? "";
      const score = Math.round(data.reliability_score);
      const text = `Hi ${data.seller_handle},\n\nYour agent '${data.agent_name}' has been automatically paused. Its reliability score dropped to ${score}/100 due to high failure rates.\n\nYour other agents are not affected.\n\nTo restore this agent, fix the underlying issues and contact support at ${supportEmail}.\n\n— The ${SITE_NAME} Team`;
      const html = wrap({
        heading: `Agent paused: <span style="font-family:'IBM Plex Mono',monospace;">${score}/100</span>`,
        bodyHtml: `<p style="margin:0 0 16px;">Hi ${data.seller_handle},</p>
          <p style="margin:0 0 16px;">Your agent <strong>'${data.agent_name}'</strong> has been automatically paused. Its reliability score dropped to <strong style="font-family:'IBM Plex Mono',monospace;">${score}/100</strong> due to high failure rates.</p>
          <p style="margin:0 0 16px;">Your other agents are not affected.</p>
          <p style="margin:0;">To restore this agent, fix the underlying issues and contact support at <a href="mailto:${supportEmail}" style="display:inline-block;background:#1976D2;color:#ffffff;text-decoration:none;padding:8px 16px;border-radius:4px;font-size:13px;">${supportEmail}</a>.</p>`,
      });
      await sendMail({
        to: data.seller_email,
        subject: `Your ${SITE_NAME} agent has been paused`,
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
          <p style="margin:0 0 16px;color:#777777;">Their reason:</p>
          <p style="margin:0 0 16px;padding:12px;border-left:2px solid #cccccc;">${safeReason}</p>
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
  .inputValidator((input: unknown) =>
    z.object({ seller_id: z.string().uuid(), agent_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }) => {
    try {
      const { data: ag } = await supabaseAdmin
        .from("agents")
        .select("name, status, reliability_score")
        .eq("id", data.agent_id)
        .maybeSingle();
      if (!ag) return { success: false as const, error: "agent_not_found" };
      const score = Number(ag.reliability_score ?? 100);
      if (score >= 50 || ag.status !== "paused") {
        return { success: true as const, skipped: true as const };
      }
      const s = await getSellerEmail(data.seller_id);
      if (!s.email) return { success: false as const, error: "seller_email_not_found" };
      const handle = s.handle ?? "there";
      const supportEmail = process.env.GMAIL_USER ?? "";
      const scoreInt = Math.round(score);
      const text = `Hi ${handle},\n\nYour agent '${ag.name}' has been automatically paused. Its reliability score dropped to ${scoreInt}/100 due to high failure rates.\n\nYour other agents are not affected.\n\nTo restore this agent, fix the underlying issues and contact support at ${supportEmail}.\n\n— The ${SITE_NAME} Team`;
      const html = wrap({
        heading: `Agent paused: <span style="font-family:'IBM Plex Mono',monospace;">${scoreInt}/100</span>`,
        bodyHtml: `<p style="margin:0 0 16px;">Hi ${handle},</p>
          <p style="margin:0 0 16px;">Your agent <strong>'${ag.name}'</strong> has been automatically paused. Its reliability score dropped to <strong style="font-family:'IBM Plex Mono',monospace;">${scoreInt}/100</strong> due to high failure rates.</p>
          <p style="margin:0 0 16px;">Your other agents are not affected.</p>
          <p style="margin:0;">To restore this agent, fix the underlying issues and contact support at <a href="mailto:${supportEmail}" style="display:inline-block;background:#1976D2;color:#ffffff;text-decoration:none;padding:8px 16px;border-radius:4px;font-size:13px;">${supportEmail}</a>.</p>`,
      });
      await sendMail({ to: s.email, subject: `Your ${SITE_NAME} agent has been paused`, text, html });
      return { success: true as const };
    } catch (err) {
      return { success: false as const, error: (err as Error).message };
    }
  });

// --- 4. Agent restored (admin-triggered) --------------------------------
export const sendAgentRestoredEmail = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        seller_email: z.string().email(),
        seller_handle: z.string().min(1).max(200),
        agent_name: z.string().min(1).max(300),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    try {
      const text = `Hi ${data.seller_handle},\n\nGood news — your agent '${data.agent_name}' has been reviewed and restored. It is now live on ${SITE_NAME} again.\n\nPlease ensure the underlying issues have been fixed to avoid another automatic pause.\n\nIf you have any questions, reply to this email.\n\n— The ${SITE_NAME} Team`;
      const html = wrap({
        heading: "Agent restored",
        bodyHtml: `<p style="margin:0 0 16px;">Hi ${data.seller_handle},</p>
          <p style="margin:0 0 16px;">Good news — your agent <strong>'${data.agent_name}'</strong> has been reviewed and restored. It is now live on ${SITE_NAME} again.</p>
          <p style="margin:0 0 16px;">Please ensure the underlying issues have been fixed to avoid another automatic pause.</p>
          <p style="margin:0;">If you have any questions, reply to this email.</p>`,
      });
      await sendMail({
        to: data.seller_email,
        subject: `Your ${SITE_NAME} agent has been restored`,
        text,
        html,
      });
      return { success: true as const };
    } catch (err) {
      return { success: false as const, error: (err as Error).message };
    }
  });

// --- 5. Subscriber: agent paused -----------------------------------------
export const pauseAndNotifySubscribers = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ agent_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }) => {
    try {
      const { data: rows, error } = await (supabaseAdmin as any).rpc(
        "pause_subscriptions_for_agent",
        { _agent_id: data.agent_id },
      );
      if (error) return { success: false as const, error: error.message };
      const list = (rows ?? []) as Array<{
        buyer_email: string | null;
        agent_name: string;
        seller_handle: string | null;
      }>;
      let sent = 0;
      for (const r of list) {
        if (!r.buyer_email) continue;
        const handle = r.seller_handle ?? "the seller";
        const text = `Hi,\n\nThe agent '${r.agent_name}' by @${handle} that you're subscribed to has been automatically paused due to reliability issues.\n\nYou can cancel your subscription and receive a full refund from your subscriptions page.\n\nWe apologize for the inconvenience.\n\n— The ${SITE_NAME} Team`;
        const html = wrap({
          heading: "An agent you're subscribed to has been paused",
          bodyHtml: `<p style="margin:0 0 16px;">Hi,</p>
            <p style="margin:0 0 16px;">The agent <strong>'${r.agent_name}'</strong> by <strong>@${handle}</strong> that you're subscribed to has been automatically paused due to reliability issues.</p>
            <p style="margin:0 0 16px;">You can cancel your subscription and receive a full refund from your subscriptions page.</p>
            <p style="margin:0;">We apologize for the inconvenience.</p>`,
        });
        try {
          await sendMail({
            to: r.buyer_email,
            subject: "An agent you're subscribed to has been paused",
            text,
            html,
          });
          sent++;
        } catch (e) {
          console.error("pause subscriber email failed", e);
        }
      }
      return { success: true as const, sent, paused: list.length };
    } catch (err) {
      return { success: false as const, error: (err as Error).message };
    }
  });

// --- 6. Subscriber: agent restored ---------------------------------------
export const notifyRestoredSubscribers = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ agent_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }) => {
    try {
      const { data: rows, error } = await (supabaseAdmin as any).rpc(
        "list_reactivated_subscribers",
        { _agent_id: data.agent_id },
      );
      if (error) return { success: false as const, error: error.message };
      const list = (rows ?? []) as Array<{
        buyer_email: string | null;
        agent_name: string;
        seller_handle: string | null;
      }>;
      let sent = 0;
      for (const r of list) {
        if (!r.buyer_email) continue;
        const handle = r.seller_handle ?? "the seller";
        const text = `Hi,\n\nThe agent '${r.agent_name}' by @${handle} has been restored and is live again.\n\nYour subscription is now active. You can continue running it from your subscriptions page.\n\n— The ${SITE_NAME} Team`;
        const html = wrap({
          heading: "Good news — your agent subscription has been restored",
          bodyHtml: `<p style="margin:0 0 16px;">Hi,</p>
            <p style="margin:0 0 16px;">The agent <strong>'${r.agent_name}'</strong> by <strong>@${handle}</strong> has been restored and is live again.</p>
            <p style="margin:0;">Your subscription is now active. You can continue running it from your subscriptions page.</p>`,
        });
        try {
          await sendMail({
            to: r.buyer_email,
            subject: "Good news — your agent subscription has been restored",
            text,
            html,
          });
          sent++;
        } catch (e) {
          console.error("restored subscriber email failed", e);
        }
      }
      return { success: true as const, sent };
    } catch (err) {
      return { success: false as const, error: (err as Error).message };
    }
  });
