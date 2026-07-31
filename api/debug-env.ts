import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const envKeys = Object.keys(process.env);
  
  return res.status(200).json({
    message: "Debugging Environment Variables",
    available_keys: envKeys.filter(key => key.includes('SMTP') || key.includes('VITE') || key.includes('SUPABASE') || key.includes('GEMINI')),
    smtp_user_exists: !!process.env.SMTP_USER,
    smtp_pass_exists: !!process.env.SMTP_PASS,
    gemini_api_key_exists: !!(process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY),
    node_env: process.env.NODE_ENV
  });
}
