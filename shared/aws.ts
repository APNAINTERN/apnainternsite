/** Deployed AWS API (Lambda + API Gateway staging). Used when VITE_* env vars are unset. */
export const AWS_STAGING_API_ORIGIN =
  "https://eikmcrd7ei.execute-api.ap-south-1.amazonaws.com/staging";

/** Browser anon key for the local/Lambda PostgREST + auth shim (not a real Supabase JWT). */
export const AWS_LOCAL_ANON_KEY = "local-anon-key";

export const AWS_LOCAL_PROJECT_ID = "apnaintern-local";
