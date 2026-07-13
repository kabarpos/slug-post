# Code Conventions

## Controllers

- All controllers in `app/controllers/` exported as instances (`export default new Controller()`)
- **Never use `this`** — controllers are singletons
- Use built-in controllers before creating new ones
- Use built-in services first (`View.ts`)

## Repository Pattern (Data Access)

All database queries are in `app/repositories/`. Controllers **never** write raw SQL or import `better-sqlite3` directly.

### Foundation

- `app/repositories/db.ts` — better-sqlite3 instance with WAL mode, synchronous=NORMAL, cache_size=-8000
- Import: `import db from "./db"`
- Low-level: `db.prepare("SELECT ...").get(...)`, `.all(...)`, `.run(...)`

### Available Repositories

| File | Key Export | Key Methods |
|------|-----------|-------------|
| `posts.ts` | `posts` | `findBySlug`, `findBySlugAndToken`, `create`, `updateContent`, `incrementView`, `claim`, `findByAuthor`, `allSlugs`, `isSlugTaken` |
| `users.ts` | `users` | `findById`, `findByEmail`, `findByPhone`, `findByIdLight`, `findByIdAuth`, `create`, `updateProfile`, `updatePassword`, `markVerified`, `deleteByIds` |
| `sessions.ts` | `sessions` | `findById`, `create`, `deleteById` |
| `assets.ts` | `assets` | `create`, `findByUser`, `findByIdAndUser`, `deleteByIdAndUser` |
| `passwordResetTokens.ts` | `passwordResetTokens` | `findValid`, `create`, `deleteByToken` |
| `emailVerificationTokens.ts` | `emailVerificationTokens` | `findValid`, `deleteByUserId`, `deleteById`, `create` |

### Usage in Controllers

```typescript
import { posts } from "../repositories/posts";
import { users } from "../repositories/users";

const post = posts.findBySlug(slug);
const user = users.findByEmail(email);
posts.incrementView(post.id);
```

### Knex (devDependency — CLI Migrations Only)

Knex tetap ada di `devDependencies` hanya untuk menjalankan migrasi database via CLI. Runtime **tidak** menggunakan Knex sama sekali.

```bash
npm run migrate              # npx knex migrate:latest
npm run migrate:make -- name # npx knex migrate:make name
npm run seed                  # npx knex seed:run
```

> **Catatan:** Semua query runtime menggunakan better-sqlite3 langsung via `app/repositories/`. Knex tidak diimport di kode runtime.

### Method Patterns

| Method | SSR | Inertia | HTTP Status |
|--------|-----|---------|-------------|
| `index()` | `view()` | `response.inertia()` | 200 |
| `create()` | `view()` | `response.inertia()` | 200 |
| `store()` | — | — | 302 redirect |
| `show()` | `view()` | `response.inertia()` | 200 |
| `edit()` | `view()` | `response.inertia()` | 200 |
| `update()` | — | — | 303 redirect |
| `destroy()` | — | — | 303 redirect |

### Controller Signature

```typescript
import { Request, Response } from "../../type";
import { posts } from "../repositories/posts";

class Controller {
  public async method(request: Request, response: Response) {
    const post = posts.findBySlug(slug);
    // validation, business logic, then respond
  }
}
export default new Controller();
```

### Validation Pattern

```typescript
const validationResult = Validator.validate(schema, body);
if (!validationResult.success) {
  const firstError = Object.values(validationResult.errors)[0]?.[0] || 'Validasi gagal';
  return response.flash("error", firstError).redirect("/path", 302);
}
```

### Flash Messages

- `response.flash("success", msg)` / `response.flash("error", msg)`
- Available in Inertia as `flash` prop: `let { flash } = $props()`
- Display directly: `{#if flash?.error}{flash.error}{/if}`

## SSR Pages (Eta)

- Templates in `resources/views/` as `.html` files
- Use `view()` from `app/services/View`
- Automatic vars: `base_url`, `current_year`, `asset(file)` helper
- Dev mode: assets served from Vite dev server at `VITE_PORT`
- Prod mode: assets from Vite manifest in `dist/.vite/manifest.json`

## Inertia + Svelte 5 Pages

- Pages in `resources/js/Pages/`
- Components in `resources/js/Components/`
- Use Svelte 5 runes: `$state()`, `$props()`, `$derived()`
- Import from `@inertiajs/svelte`: `router`, `use:inertia` directive
- Use `DashboardLayout` component for protected pages
- No TypeScript in .svelte files (JavaScript only)
- Lucide icons: `import { IconName } from 'lucide-svelte'`

### Basic Inertia Page Pattern

```svelte
<script>
  import { router } from '@inertiajs/svelte'
  let { flash, data } = $props()
  let isLoading = $state(false)
</script>

{#if flash?.error}<div class="...">{flash.error}</div>{/if}
<a href="/path" use:inertia>Link</a>
```

## Auth Middleware

- **`auth.ts`**: Redirects to `/login` if no valid session
- **`optionalAuth.ts`**: Sets `request.user` if authenticated, no redirect if not
- Both check `request.cookies.auth_id` → sessions table → users table

## Markdown Rendering

- Server-side via markdown-it in `PostController.show()`
- Security: `html: false` to prevent XSS
- Plugins: markdown-it-anchor, markdown-it-emoji, highlight.js

## Related

- [[entities/slugpost-platform]]
- [[concepts/laju-architecture]]
- [[concepts/svelte-inertia-pages]]
- [[concepts/eta-ssr-templates]]
