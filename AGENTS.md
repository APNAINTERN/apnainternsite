# AGENTS.md

Guidance for AI agents working in this repository.

## Repository status

**As of initial setup (2026-07-31):** This repository contains only `README.md` (`# apnainternsite`). There is no application source code, dependency manifests, Docker configuration, CI workflows, or runnable services.

## Cursor Cloud specific instructions

### What exists today

- Single file: `README.md`
- No `package.json`, `requirements.txt`, `Dockerfile`, `docker-compose.yml`, `Makefile`, or `.devcontainer/` configuration
- No lint, test, or build scripts

### Services

| Service | Status |
|---------|--------|
| *(none)* | No services are defined in this repository |

### Development workflow (when code is added)

Once application code and dependency manifests are committed, future agents should:

1. **Install dependencies** using the project's lockfile and package manager (e.g. `npm ci`, `pnpm install`, `pip install -r requirements.txt`).
2. **Start required backing services** (database, Redis, etc.) per `README.md` or `docker-compose.yml` if present.
3. **Run the dev server** using the script documented in `package.json` or the README (e.g. `npm run dev`), not production build commands.
4. **Lint and test** using project scripts (e.g. `npm run lint`, `npm test`).

### Update script

The VM update script is a no-op (`true`) until dependency manifests exist. After manifests are added, replace it with the appropriate install command (e.g. `npm ci`).

### End-to-end verification

E2E testing is not possible until an application is implemented. The minimum hello-world flow will depend on the chosen stack (e.g. load the homepage in a browser, hit a health endpoint).
