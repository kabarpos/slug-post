# Database Schema

## Connection

- **Driver:** better-sqlite3 (langsung, via `app/repositories/db.ts`)
- Dev: `./data/dev.sqlite3`
- Prod: `./data/production.sqlite3`
- PRAGMAs on boot: `journal_mode=WAL`, `synchronous=NORMAL`, `foreign_keys=ON`, `cache_size=-8000`, `temp_store=MEMORY`
- Queries via **repository pattern** di `app/repositories/`:
  ```typescript
  import { posts } from "../repositories/posts";
  const post = posts.findBySlug(slug);
  ```

## Users Table (`20230513055909_users.ts`)

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | Primary key |
| `name` | VARCHAR(255) | |
| `email` | VARCHAR(255) | Unique, indexed |
| `phone` | VARCHAR(255) | |
| `password` | VARCHAR(180) | bcrypt hash |
| `is_verified` | BOOLEAN | Email verified |
| `is_admin` | BOOLEAN | Admin privileges |
| `membership_date` | TIMESTAMP | |
| `remember_me_token` | VARCHAR | |
| `created_at` | TIMESTAMP | |
| `updated_at` | TIMESTAMP | |

## Sessions Table (`20230514062913_sessions.ts`)

| Column | Type | Notes |
|--------|------|-------|
| `id` | VARCHAR | Session ID (stored in cookie `auth_id`) |
| `user_id` | UUID | FK → users.id |
| `ip_address` | VARCHAR(45) | |
| `user_agent` | VARCHAR(500) | |
| `payload` | TEXT | |
| `last_activity` | INTEGER | |

## Posts Table (`20250106000001_create_posts.ts`)

| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER | Primary key |
| `slug` | VARCHAR(255) | Unique, indexed |
| `content` | TEXT | Markdown content |
| `title` | VARCHAR(500) | Extracted from markdown H1 |
| `edit_token` | VARCHAR(100) | Unique UUID, indexed |
| `author_id` | UUID | FK → users.id, nullable |
| `view_count` | INTEGER | Default 0 |
| `format` | VARCHAR | Added later, 'markdown' or 'html' |
| `meta` | TEXT | JSON metadata |
| `created_at` | TIMESTAMP | |
| `updated_at` | TIMESTAMP | |
| `last_viewed_at` | TIMESTAMP | |

## Post Analytics Table (`20250106000002_create_post_analytics.ts`)

| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER | Primary key |
| `post_id` | INTEGER | FK → posts.id |
| `ip_address` | VARCHAR(45) | IPv6 support |
| `user_agent` | VARCHAR(500) | |
| `referer` | VARCHAR(500) | |
| `country` | VARCHAR(2) | Country code (optional) |
| `viewed_at` | TIMESTAMP | |

## Other Tables

- **Password Reset Tokens** (`20240101000001_create_password_reset_tokens.ts`)
- **Email Verification Tokens** (`20240101000002_create_email_verification_tokens.ts`)
- **Assets** (`20250110233301_assets.ts`) — media file metadata
- **Backup Files** (`20251023082000_create_backup_files.ts`)

## Auth Flow

1. Login → create session → set cookie `auth_id=<session_id>`
2. `auth.ts` middleware: read `auth_id` cookie → query sessions → load user
3. `optionalAuth.ts`: same but no redirect if not authenticated
4. Logout → clear cookie

## Related

- [[entities/slugpost-platform]]
- [[concepts/laju-architecture]]
