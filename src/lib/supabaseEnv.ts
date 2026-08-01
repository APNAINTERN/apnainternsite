/**
 * Resolves Supabase-js client URL + key for the browser bundle.
 * Production default: AWS Lambda shim → RDS (not Lovable/Supabase cloud).
 *
 * Override with Vercel env:
 *   VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY, VITE_SUPABASE_PROJECT_ID
 */
import {
  AWS_LOCAL_ANON_KEY,
  AWS_LOCAL_PROJECT_ID,
  AWS_STAGING_API_ORIGIN,
} from "../../shared/aws";
import { resolveBrowserApiOrigin } from "./awsApiOrigin";

export function resolveSupabaseProjectId(): string {
  const fromEnv = String(import.meta.env.VITE_SUPABASE_PROJECT_ID || "").trim();
  return fromEnv || AWS_LOCAL_PROJECT_ID;
}

export function resolveSupabaseUrl(): string {
  const fromEnv = String(import.meta.env.VITE_SUPABASE_URL || "").trim();
  return resolveBrowserApiOrigin(fromEnv || AWS_STAGING_API_ORIGIN);
}

export function resolveSupabaseAnonKey(): string {
  const fromEnv = String(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "").trim();
  if (fromEnv) return fromEnv;
  return AWS_LOCAL_ANON_KEY;
}

export function assertSupabaseConfig(url: string, context = "Supabase client"): void {
  if (!url) {
    throw new Error(
      `[apnaintern] ${context}: supabaseUrl is required. ` +
        "Set VITE_SUPABASE_URL in .env.local (dev) or Vercel Environment Variables (production), " +
        "or run npm run dev:frontend:awsrds for local AWS shim."
    );
  }
}

/** True when the bundle still points at hosted Supabase (*.supabase.co). */
export function isHostedSupabaseUrl(url: string): boolean {
  return /supabase\.co/i.test(url);
}
