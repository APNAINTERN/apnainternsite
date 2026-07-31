# AGENTS.md

Guidance for AI agents working in this repository.

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Cursor Cloud specific instructions

### Stack

- **Next.js 16** (App Router) + **React 19** + **TypeScript** + **Tailwind CSS 4**
- Package manager: **npm** (`package-lock.json`)

### Services

| Service | Required | Port | Start command |
|---------|----------|------|---------------|
| Next.js dev server | Yes | 3000 | `npm run dev` |

No database, Redis, or Docker services are required for local development.

### Common commands

```bash
npm ci          # Install dependencies (use in VM update script)
npm run dev     # Development server — bind is localhost:3000 by default
npm run lint    # ESLint
npm run build   # Production build
npm run start   # Production server (run after build)
```

### End-to-end verification

1. Start `npm run dev`
2. `curl http://localhost:3000` — homepage should include "Apna Intern"
3. `curl http://localhost:3000/api/health` — should return JSON `{"status":"ok",...}`

### Notes

- `next-env.d.ts` is gitignored; Next.js regenerates it on `dev`/`build`.
- Use `npm run dev`, not `npm run start`, during development unless testing a production build.
