import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  applyCorsHeaders,
  applySecurityHeaders,
  requireAuth,
} from "./lib/apiSecurity";

/** Self-contained handler — do not re-export from api/gemini/* (Vercel FUNCTION_INVOCATION_FAILED). */

const GEMINI_MODELS = [
  "gemini-2.5-flash-lite",
  "gemini-flash-lite-latest",
  "gemini-2.5-flash",
  "gemini-flash-latest",
];

function resolveGeminiApiKey(): string {
  const raw =
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
    "";
  return raw.trim().replace(/^["']|["']$/g, "");
}

function isGeminiQuotaError(message: string): boolean {
  return /quota|rate.?limit|resource exhausted|limit:\s*0/i.test(message);
}

function shouldRetryGemini(status: number, message: string): boolean {
  return [404, 429, 500, 503].includes(status) || isGeminiQuotaError(message);
}

async function callGeminiModel(
  apiKey: string,
  model: string,
  prompt: string
): Promise<{ ok: true; text: string } | { ok: false; status: number; message: string }> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.5, maxOutputTokens: 8192 },
    }),
  });

  let body: {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
    error?: { message?: string; status?: string };
  } = {};

  try {
    body = (await res.json()) as typeof body;
  } catch {
    return { ok: false, status: res.status, message: `Invalid response from Gemini (${res.status})` };
  }

  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      message: body.error?.message || `Gemini API error (${res.status})`,
    };
  }

  const text = body.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
  if (!text) {
    return { ok: false, status: 502, message: "Gemini returned no text. Try a shorter prompt." };
  }

  return { ok: true, text };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  applyCorsHeaders(req, res);
  applySecurityHeaders(res);

  try {
    if (req.method === "OPTIONS") return res.status(200).end();

    if (req.method === "GET") {
      const configured = Boolean(resolveGeminiApiKey());
      return res.status(200).json({
        ok: true,
        configured,
        message: configured
          ? "Gemini API key is set on the server."
          : "GEMINI_API_KEY is missing — add it in Vercel Project Settings → Environment Variables, then redeploy.",
      });
    }

    if (req.method !== "POST") {
      return res.status(405).json({ success: false, error: "Method not allowed" });
    }

    const user = await requireAuth(req, res);
    if (!user) return;

    const apiKey = resolveGeminiApiKey();
    if (!apiKey) {
      return res.status(500).json({
        success: false,
        error:
          "GEMINI_API_KEY is not configured on the server. In Vercel: Project Settings → Environment Variables → add GEMINI_API_KEY (your Google AI Studio key), then redeploy.",
      });
    }

    const prompt = String((req.body as { prompt?: string })?.prompt || "").trim();
    if (!prompt) {
      return res.status(400).json({ success: false, error: "Missing prompt" });
    }

    let lastError = "The service is currently unavailable.";

    for (const model of GEMINI_MODELS) {
      try {
        const result = await callGeminiModel(apiKey, model, prompt);
        if (result.ok) {
          return res.status(200).json({ success: true, text: result.text, model });
        }
        lastError = result.message;
        if (!shouldRetryGemini(result.status, result.message)) break;
      } catch (err: unknown) {
        lastError = err instanceof Error ? err.message : String(err);
      }
    }

    return res.status(503).json({
      success: false,
      error: lastError,
      hint: "Get a key at https://aistudio.google.com/app/apikey and set GEMINI_API_KEY in Vercel env.",
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[gemini-generate]", message);
    return res.status(500).json({
      success: false,
      error: message || "Gemini handler failed unexpectedly.",
    });
  }
}
