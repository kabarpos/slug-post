# Development Workflow

## Prerequisites

- Node.js 18+
- npm

## Quick Start

```bash
npm install
cp .env.example .env
npm run migrate
npm run dev
```

## Key Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server (Vite + nodemon concurrently) |
| `npm run build` | Vite build + tsc + tsc-alias |
| `npm run migrate` | Run all pending migrations |
| `npm run migrate:make -- name` | Create new migration |
| `npm run seed` | Seed sample data |

## Dev Server Architecture

```bash
npm run dev  # runs two processes concurrently:
# 1. vite — asset bundler with HMR (serves JS/CSS at VITE_PORT)
# 2. nodemon — watches for TS changes, restarts server on :PORT
```

## Building Blocks — Creating a New Feature

### New Route + SSR Page

1. Add route in `routes/web.ts`
2. Create controller method in `app/controllers/`
3. Create Eta template in `resources/views/`

### New Route + Inertia Page

1. Add route in `routes/web.ts`
2. Create controller method using `response.inertia("PageName", data)`
3. Create Svelte 5 page in `resources/js/Pages/PageName.svelte`

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | 5555 |
| `APP_URL` | Public app URL | |
| `NODE_ENV` | development/production | |
| `DB_FILENAME` | Database filename (inside `data/` folder) | `dev.sqlite3` / `production.sqlite3` (auto dari NODE_ENV) |
| `VITE_PORT` | Vite dev server port | |
| `HAS_CERTIFICATE` | Enable HTTPS for local dev | |
| `GOOGLE_CLIENT_ID` | Google OAuth | |
| `GOOGLE_CLIENT_SECRET` | Google OAuth | |
| `S3_*` | S3-compatible storage | |
| `REDIS_URL` | Redis (optional) | |
| `SMTP_*` | Email settings | |

## Production Build

```bash
npm run build
# Output: dist/ (Vite assets), build/ (TSC compiled JS)
```

## Related

- [[entities/slugpost-platform]]
- [[concepts/code-conventions]]
