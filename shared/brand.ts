/** Public-facing brand identity for Apna Intern (UI, PDFs, emails). */
export const BRAND_NAME = "Apna Intern";

export const BRAND_LEGAL_NAME = "Apna Intern";

export const BRAND_CONTACT_EMAIL = "contact@apnaintern.in";
export const BRAND_SUPPORT_EMAIL = "support@apnaintern.in";
export const BRAND_ADMIN_EMAIL = "admin@apnaintern.in";
export const BRAND_NOREPLY_EMAIL = "noreply@apnaintern.in";
export const BRAND_INFO_EMAIL = "info@apnaintern.in";

export const BRAND_WEBSITE_HOST = "www.apnaintern.in";
export const BRAND_WEBSITE_URL = `https://${BRAND_WEBSITE_HOST}`;

export const BRAND_MAIL_FROM = `${BRAND_NAME} <${BRAND_ADMIN_EMAIL}>`;

export const BRAND_VERIFY_PATH = "/verify";
export const BRAND_VERIFY_ID_PATH = "/verify-id";
export const BRAND_LOGIN_PATH = "/login?portal=student";

export function brandVerifyUrl(origin = BRAND_WEBSITE_URL): string {
  return `${origin.replace(/\/$/, "")}${BRAND_VERIFY_PATH}`;
}

export function brandLoginUrl(origin = BRAND_WEBSITE_URL): string {
  return `${origin.replace(/\/$/, "")}${BRAND_LOGIN_PATH}`;
}
