/** Models that work on Google AI Studio free tier (try in order). */
export const GEMINI_MODELS = [
  "gemini-2.5-flash-lite",
  "gemini-flash-lite-latest",
  "gemini-2.5-flash",
  "gemini-flash-latest",
];

export function isGeminiQuotaError(message: string): boolean {
  return /quota|rate.?limit|resource exhausted|limit:\s*0/i.test(message);
}

export function shouldRetryGeminiFailure(status: number, message: string): boolean {
  if (isRetryableGeminiStatus(status)) return true;
  return isGeminiQuotaError(message);
}

export function formatGeminiUserError(raw: string): string {
  if (/limit:\s*0/i.test(raw)) {
    return (
      "Gemini free-tier limit hit for that model. Wait ~30 seconds, use fewer questions (e.g. 5), " +
      "then restart with npm run dev so the latest models are used. Your AIza… key is valid for the free tier."
    );
  }

  if (isGeminiQuotaError(raw)) {
    const retryMatch = raw.match(/retry in (\d+(?:\.\d+)?)\s*s/i);
    const waitSec = retryMatch ? Math.ceil(parseFloat(retryMatch[1])) : 30;
    return (
      `Gemini free-tier limit reached. Wait about ${waitSec} seconds, use fewer questions (e.g. 5), ` +
      "or create a fresh key at aistudio.google.com/app/apikey. Free tier has daily/minute caps."
    );
  }

  if (/api key not valid|invalid api key|permission denied/i.test(raw)) {
    return "Invalid Gemini API key. Get a new one at aistudio.google.com/app/apikey and update GEMINI_API_KEY in .env.";
  }

  return raw.length > 280 ? `${raw.slice(0, 277)}…` : raw;
}

export function isRetryableGeminiStatus(status: number): boolean {
  return [404, 429, 500, 503].includes(status);
}
