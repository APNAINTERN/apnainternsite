import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import fs from "node:fs";

/**
 * Staging (aws-work): set VITE_* in Vercel to the Lambda API URL — not localhost.
 * For `vite --mode awsrds`, force VITE_SUPABASE_* to the local Express shim.
 * Vite normally prefers existing process.env over .env.awsrds.local — that was
 * why the browser kept calling https://*.supabase.co even with the flag file.
 */
function applyAwsRdsEnvOverrides(mode: string) {
  if (mode !== "awsrds") return;

  const root = process.cwd();
  // Same-origin URL (Vite :8080) — proxy /auth + /rest → API :3000. Avoids CORS.
  const overrides: Record<string, string> = {
    VITE_SUPABASE_URL: "http://localhost:8080",
    VITE_SUPABASE_PUBLISHABLE_KEY: "local-anon-key",
    VITE_SUPABASE_PROJECT_ID: "ezyintern-local",
    VITE_SITE_API_ORIGIN: "http://localhost:8080",
    VITE_PUBLIC_APP_URL: "http://localhost:8080",
  };

  // Merge any extra keys from .env.awsrds.local (except we always keep local Supabase URL)
  const localPath = path.join(root, ".env.awsrds.local");
  if (fs.existsSync(localPath)) {
    for (const line of fs.readFileSync(localPath, "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#") || !t.includes("=")) continue;
      const eq = t.indexOf("=");
      const key = t.slice(0, eq).trim();
      let val = t.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
      if (key.startsWith("VITE_") && !(key in overrides)) {
        overrides[key] = val;
      }
    }
  }

  for (const [k, v] of Object.entries(overrides)) {
    process.env[k] = v;
  }
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  applyAwsRdsEnvOverrides(mode);
  // Ensure loadEnv sees the forced values
  loadEnv(mode, process.cwd(), "VITE_");

  const isAwsRds = mode === "awsrds";

  return {
    server: {
      host: "::",
      port: 8080,
      hmr: {
        overlay: false,
      },
      proxy: {
        "/api": { target: "http://localhost:3000", changeOrigin: true },
        "/auth": { target: "http://localhost:3000", changeOrigin: true },
        "/rest": { target: "http://localhost:3000", changeOrigin: true },
        "/storage": { target: "http://localhost:3000", changeOrigin: true },
        "/functions": { target: "http://localhost:3000", changeOrigin: true },
      },
    },
    // Hard-bake same-origin URL so browser never cross-origin to :3000 (no CORS)
    define: isAwsRds
      ? {
          "import.meta.env.VITE_SUPABASE_URL": JSON.stringify("http://localhost:8080"),
          "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify("local-anon-key"),
          "import.meta.env.VITE_SUPABASE_PROJECT_ID": JSON.stringify("ezyintern-local"),
          "import.meta.env.VITE_SITE_API_ORIGIN": JSON.stringify("http://localhost:8080"),
          "import.meta.env.VITE_PUBLIC_APP_URL": JSON.stringify("http://localhost:8080"),
        }
      : undefined,
    plugins: [react()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
      dedupe: [
        "react",
        "react-dom",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
        "@tanstack/react-query",
        "@tanstack/query-core",
      ],
    },
  };
});
