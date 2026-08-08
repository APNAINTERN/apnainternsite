/**
 * Local dev / Docker entry — not used on Lambda.
 */
import { createApp } from "./app";

const PORT = Number(process.env.PORT || 3000);

createApp()
  .then((app) => {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`\n✅ Apna Intern API (local) http://0.0.0.0:${PORT}`);
      console.log(`   Health: GET /api/health\n`);
    });
  })
  .catch((err) => {
    console.error("Failed to start API server:", err);
    process.exit(1);
  });
