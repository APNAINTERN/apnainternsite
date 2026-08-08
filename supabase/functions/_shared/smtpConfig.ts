import { BRAND_ADMIN_EMAIL, BRAND_NAME } from "./brand.ts";

type SmtpConnectOpts = {
  hostname: string;
  port: number;
  username: string;
  password: string;
};

/** Shape of deno.land/x/smtp SmtpClient — typed locally to avoid Deno URL imports in shared code. */
export interface SmtpClientLike {
  connect(opts: SmtpConnectOpts): Promise<void>;
  connectTLS(opts: SmtpConnectOpts): Promise<void>;
}

export function resolveSmtpHost(): string {
  return (
    Deno.env.get("SMTP_HOST") ??
    Deno.env.get("SES_SMTP_HOST") ??
    "email-smtp.ap-south-1.amazonaws.com"
  );
}

export function resolveSmtpPort(): number {
  const raw = Deno.env.get("SMTP_PORT") ?? "587";
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : 587;
}

/** Verified SES identity — not the SMTP username (AKIA…). */
export function resolveMailFrom(label = BRAND_NAME): string {
  const explicit = Deno.env.get("MAIL_FROM") ?? Deno.env.get("SMTP_FROM");
  if (explicit?.trim()) return explicit.trim();
  const addr = Deno.env.get("MAIL_FROM_ADDRESS") ?? BRAND_ADMIN_EMAIL;
  return `${label} <${addr}>`;
}

export function getSmtpCredentials(): { user: string; pass: string } {
  return {
    user: Deno.env.get("SMTP_USER") ?? "",
    pass: Deno.env.get("SMTP_PASS") ?? "",
  };
}

export async function connectSmtpClient(client: SmtpClientLike): Promise<void> {
  const { user, pass } = getSmtpCredentials();
  const hostname = resolveSmtpHost();
  const port = resolveSmtpPort();
  const opts = { hostname, port, username: user, password: pass };
  if (port === 465) {
    await client.connectTLS(opts);
  } else {
    await client.connect(opts);
  }
}
