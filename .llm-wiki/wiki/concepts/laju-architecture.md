# Laju Architecture

Laju is a custom full-stack TypeScript framework built on HyperExpress + Svelte 5 + Inertia.js. It is **not a package** — it's the project structure and conventions used across Maulana Shalihin's projects (SlugPost, tapsite.ai, etc.).

## Entry Point

- **`server.ts`** — boots HyperExpress, registers global middlewares (CORS, Inertia), mounts routes, starts HTTPS if certificates present.
- HyperExpress config: 10MB body limit, optional TLS for local dev.

## Middleware Pipeline

1. `cors()` — cross-origin support
2. `inertia()` — Inertia.js request/response handling (`app/middlewares/inertia.ts`)
3. Route-level auth: `auth.ts` (required) or `optionalAuth.ts` (optional)
4. Route handler (controller)

## SSR vs Inertia Decision

| Page Type | Auth | SEO | Render Method |
|-----------|------|-----|---------------|
| Public | No | Yes | SSR via `view()` (Eta templates in `resources/views/`) |
| Public | No | No | Inertia via `response.inertia()` |
| Protected | Yes | No | Inertia via `response.inertia()` |

SEO-critical pages (home, about, docs, post view) use SSR with Eta templates. App-like pages (dashboard, edit, profile) use Inertia + Svelte 5.

## Response Types (via type/index.d.ts)

```typescript
interface Response extends HyperExpress.Response {
  view(template: string, data?: any): void  // SSR with Eta
  inertia(page: string, data?: any): void   // Inertia.js Svelte
  flash(type: string, data: any): Response  // Flash messages
}
interface Request extends HyperExpress.Request {
  user: any       // Authenticated user object
  share: any      // Shared Inertia props
}
```

## Project Structure

```
slugpost/
├── server.ts                  # Entry point
├── routes/web.ts              # All route definitions
├── app/
│   ├── controllers/           # Request handlers
│   ├── middlewares/           # auth, inertia, optionalAuth
│   ├── repositories/          # Data access layer (better-sqlite3)
│   └── services/              # View, Redis, Mailer, S3, etc.
├── resources/
│   ├── views/                 # Eta templates (SSR) — .html files
│   └── js/
│       ├── Pages/             # Svelte 5 pages (Inertia)
│       ├── Components/        # Reusable Svelte components
│       ├── app.js             # Inertia + Svelte app entry
│       └── index.css          # TailwindCSS
├── migrations/                # Knex migrations
├── commands/                  # Ace-style CLI commands
├── public/                    # Static assets
├── dist/                      # Vite build output
└── build/                     # TSC build output
```

## Related

- [[entities/slugpost-platform]]
- [[concepts/route-structure]]
- [[concepts/code-conventions]]
