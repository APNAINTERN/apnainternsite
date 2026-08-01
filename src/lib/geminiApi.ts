import { isLocalDevEnvironment } from "@/lib/isLocalDev";
import { siteApiUrl } from "@/lib/siteApi";
import { supabase } from "@/integrations/supabase/client";
import {
  formatGeminiUserError,
  GEMINI_MODELS,
  shouldRetryGeminiFailure,
} from "@/lib/geminiModels";

export function getGeminiGenerateApiUrl(): string {
  return siteApiUrl("/api/gemini-generate");
}

function resolveClientGeminiKey(): string {
  const raw = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;
  return (raw || "").trim().replace(/^["']|["']$/g, "");
}

async function callGeminiDirect(prompt: string, apiKey: string): Promise<string> {
  let lastError = "The service is currently unavailable.";

  for (const model of GEMINI_MODELS) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.5, maxOutputTokens: 8192 },
        }),
      }
    );

    let body: {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
      error?: { message?: string; status?: string };
    } = {};

    try {
      body = (await res.json()) as typeof body;
    } catch {
      lastError = `Invalid Gemini response (${res.status})`;
      continue;
    }

    if (!res.ok) {
      lastError = body.error?.message || `Gemini API error (${res.status})`;
      if (!shouldRetryGeminiFailure(res.status, lastError)) break;
      continue;
    }

    const text = body.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (text) return text;
    lastError = "Gemini returned no text";
  }

  throw new Error(formatGeminiUserError(lastError));
}

async function callGeminiViaServer(prompt: string, accessToken?: string): Promise<string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  const res = await fetch(getGeminiGenerateApiUrl(), {
    method: "POST",
    headers,
    body: JSON.stringify({ prompt }),
  });

  const raw = await res.text();
  let data: { text?: string; error?: string; message?: string } = {};
  if (raw) {
    try {
      data = JSON.parse(raw) as typeof data;
    } catch {
      const snippet = raw.replace(/\s+/g, " ").trim().slice(0, 160);
      if (!res.ok) {
        throw new Error(
          res.status === 404
            ? "AI API route not found. Ensure /api/gemini-generate is deployed and vercel.json does not rewrite /api/* to index.html."
            : snippet
              ? `AI request failed (${res.status}): ${snippet}`
              : `AI request failed (${res.status})`
        );
      }
    }
  }

  if (!res.ok) {
    const detail =
      data.error ||
      data.message ||
      (raw && !raw.startsWith("{") ? raw.slice(0, 200) : "") ||
      `AI request failed (${res.status})`;
    throw new Error(formatGeminiUserError(detail));
  }

  const text = data.text?.trim();
  if (!text) throw new Error("AI returned an empty response. Try again.");
  return text;
}

function isLocalServerFallbackError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("not found") ||
    m.includes("404") ||
    m.includes("failed to fetch") ||
    m.includes("networkerror") ||
    m.includes("quota") ||
    m.includes("free-tier") ||
    m.includes("free gemini") ||
    m.includes("limit hit") ||
    m.includes("503") ||
    m.includes("unavailable")
  );
}

export async function generateGeminiText(prompt: string): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  const accessToken = session?.access_token;

  try {
    return await callGeminiViaServer(prompt, accessToken);
  } catch (serverErr) {
    const clientKey = resolveClientGeminiKey();
    const serverMessage = serverErr instanceof Error ? serverErr.message : "";
    const canFallback =
      isLocalDevEnvironment() && clientKey && isLocalServerFallbackError(serverMessage);

    if (canFallback) {
      return callGeminiDirect(prompt, clientKey);
    }

    if (serverErr instanceof Error) throw serverErr;
    throw new Error("AI generation failed");
  }
}

export { formatGeminiUserError } from "@/lib/geminiModels";
