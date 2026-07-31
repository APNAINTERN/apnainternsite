import { assertSendMailOk, getSendMailApiUrl } from "@/lib/sendMailApi";

async function postMail(body: Record<string, unknown>): Promise<void> {
  const res = await fetch(getSendMailApiUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  await assertSendMailOk(res);
}

function mailPayload(
  action: string,
  data: Record<string, unknown>
): Record<string, unknown> {
  const to = String(data.to || data.email || "").trim();
  const { to: _t, email: _e, ...rest } = data;
  return { action, to, email: to, data: rest };
}

/**
 * Send a registration confirmation email to a newly registered student.
 */
export async function sendRegistrationEmail(data: Record<string, unknown>) {
  try {
    await postMail(mailPayload("registration_confirmation", data));
    console.log("Registration email sent to:", data.to);
  } catch (err) {
    console.error("Failed to send registration email:", err);
  }
}

/**
 * Send a certificate-ready notification email to a student.
 */
export async function sendCertificateEmail(data: Record<string, unknown>) {
  try {
    await postMail(mailPayload("certificate_generated", data));
    console.log("Certificate email sent to:", data.to);
  } catch (err) {
    console.error("Failed to send certificate email:", err);
  }
}
