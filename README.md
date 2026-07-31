# apnainternsite

Landing site for **Apna Intern** — internship programs and applications. Built with [Next.js](https://nextjs.org) (App Router), TypeScript, and Tailwind CSS.

## Prerequisites

- Node.js 20+ (22 recommended)
- npm 10+

## Development

Install dependencies:

```bash
npm ci
```

Start the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The homepage lists internship programs; the health API is at [http://localhost:3000/api/health](http://localhost:3000/api/health).

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Next.js dev server (port 3000) |
| `npm run build` | Production build |
| `npm run start` | Run production server (after build) |
| `npm run lint` | Run ESLint |

## Deploy on Vercel

1. Import this repository in [Vercel](https://vercel.com/new).
2. Use the default settings (Framework: **Next.js**, Build: `npm run build`).
3. Deploy from the `main` branch.

Requires Node.js **20.9+** (set automatically via `package.json` `engines`).

## Project structure

```
app/
  page.tsx           # Homepage
  layout.tsx         # Root layout
  api/health/route.ts  # Health check endpoint
public/              # Static assets
```
