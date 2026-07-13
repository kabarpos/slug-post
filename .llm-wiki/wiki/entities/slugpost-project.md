# SlugPost Project

**Location:** `/Volumes/data/Project/slugpost/`

**Description:** A high-performance TypeScript web application for instant markdown publishing. Built with Laju framework (HyperExpress + Svelte 5 + Inertia.js).

**URL:** [slugpost.com](https://slugpost.com)

**Local wiki:** `.llm-wiki/wiki/` inside project root — contains detailed architecture, routes, DB schema, code conventions, and dev workflow.

**AGENT.md:** Project root — minimal per-session context only.

**Key paths:**
- `server.ts` — entry point
- `routes/web.ts` — all routes
- `app/controllers/` — controllers
- `app/services/` — services (DB, View, etc.)
- `resources/js/Pages/` — Svelte 5/Inertia pages
- `resources/views/` — SSR Eta templates
- `migrations/` — Knex migrations

**Related:** [[concepts/laju-architecture]] [[concepts/route-structure]] [[concepts/code-conventions]]
