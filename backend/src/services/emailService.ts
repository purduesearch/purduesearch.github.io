import { Resend } from "resend";

const apiKey = process.env.RESEND_API_KEY;
const fromAddress = process.env.NEWSLETTER_FROM ?? "Purdue SEARCH <newsletter@purduesearch.org>";

// Allow the service to be imported even when API key is missing — sendBatch
// will throw a clear error at call time instead.
const resend: Resend | null = apiKey ? new Resend(apiKey) : null;

export interface SendOptions {
  to:      string;        // single recipient (we send one-by-one for tracking)
  subject: string;
  html:    string;
}

export interface SendBatchResult {
  attempted: number;
  succeeded: number;
  failed:    number;
  errors:    { to: string; error: string }[];
}

/**
 * Send an email to a single recipient via Resend.
 * Throws if RESEND_API_KEY isn't configured.
 */
export async function send({ to, subject, html }: SendOptions): Promise<void> {
  if (!resend) {
    throw new Error("RESEND_API_KEY is not configured");
  }
  const { error } = await resend.emails.send({
    from:    fromAddress,
    to,
    subject,
    html,
  });
  if (error) {
    throw new Error(typeof error === "string" ? error : ((error as { message?: string }).message ?? "Resend error"));
  }
}

/**
 * Send the same email to multiple recipients one-by-one.
 * Returns a summary; never throws — individual failures are collected.
 */
export async function sendBatch(
  recipients: string[],
  subject: string,
  htmlForRecipient: (email: string) => string
): Promise<SendBatchResult> {
  const result: SendBatchResult = { attempted: recipients.length, succeeded: 0, failed: 0, errors: [] };
  if (!resend) {
    result.failed = recipients.length;
    result.errors.push({ to: "(all)", error: "RESEND_API_KEY not configured" });
    return result;
  }
  for (const to of recipients) {
    try {
      await send({ to, subject, html: htmlForRecipient(to) });
      result.succeeded++;
    } catch (err) {
      result.failed++;
      result.errors.push({ to, error: (err as Error).message ?? "Unknown error" });
    }
  }
  return result;
}
