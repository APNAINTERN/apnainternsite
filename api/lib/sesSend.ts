import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";

function resolveFromAddress(): string {
  const explicit = (process.env.MAIL_FROM || process.env.SMTP_FROM || "").trim();
  const angle = explicit.match(/<([^>]+)>/);
  if (angle) return angle[1].trim();
  if (explicit.includes("@")) return explicit;
  return process.env.MAIL_FROM_ADDRESS || "info@apnaintern.in";
}

function resolveFromName(): string {
  const explicit = (process.env.MAIL_FROM || "").trim();
  const nameMatch = explicit.match(/^"?([^"<]+)"?\s*</);
  return nameMatch ? nameMatch[1].trim() : "Apna Intern";
}

export function canUseSesApi(): boolean {
  return Boolean(
    process.env.AWS_LAMBDA_FUNCTION_NAME ||
      process.env.USE_SES_API === "true" ||
      process.env.AWS_EXECUTION_ENV
  );
}

export async function sendEmailViaSesApi(opts: {
  to: string;
  subject: string;
  html?: string;
  text?: string;
}): Promise<void> {
  const region = process.env.SES_REGION || process.env.AWS_REGION || "ap-south-1";
  const client = new SESv2Client({ region });
  const fromAddress = resolveFromAddress();
  const fromName = resolveFromName();
  const to = opts.to.trim();
  if (!to.includes("@")) {
    throw new Error("Invalid recipient email");
  }

  await client.send(
    new SendEmailCommand({
      FromEmailAddress: `${fromName} <${fromAddress}>`,
      Destination: { ToAddresses: [to] },
      Content: {
        Simple: {
          Subject: { Data: opts.subject, Charset: "UTF-8" },
          Body: {
            ...(opts.html
              ? { Html: { Data: opts.html, Charset: "UTF-8" } }
              : {}),
            Text: {
              Data: opts.text || opts.html?.replace(/<[^>]+>/g, " ") || opts.subject,
              Charset: "UTF-8",
            },
          },
        },
      },
    })
  );
}
