---
type: source
title: "Observation: Migrasi Knex ke better-sqlite3 langsung via repository pattern"
slug: obs-2026-07-13-migrasi-knex-ke-better-sqlite3-langsung-via-repository-patte
status: observation
created: 2026-07-13
updated: 2026-07-13
relevance: high
observed_at: 2026-07-13T03:03:34.874Z
tags: ["slugpost", "refactor", "database", "repository-pattern"]
---
# ⭐ Observation: Migrasi Knex ke better-sqlite3 langsung via repository pattern
Complete migration from Knex + DB.ts to direct better-sqlite3 via app/repositories/

New structure:
- app/repositories/db.ts — better-sqlite3 instance with WAL mode PRAGMAs
- app/repositories/posts.ts — post queries (findBySlug, create, update, claim, incrementView, etc.)
- app/repositories/users.ts — user queries (findById, findByEmail, create, update, markVerified, deleteByIds)
- app/repositories/sessions.ts — session queries (findById, create, deleteById)
- app/repositories/passwordResetTokens.ts — password reset token queries
- app/repositories/emailVerificationTokens.ts — email verification token queries
- app/repositories/assets.ts — asset queries (create, findByUser, delete)

Knex moved to devDependencies (migrations/seeds only).

Updated files: auth.ts middleware, optionalAuth.ts middleware, Authenticate.ts service, PostController, AuthController, HomeController, SitemapController, AssetController, package.json, AGENT.md.

Zero TypeScript errors on tsc --noEmit.
*Relevance: high*

*Tags: slugpost refactor database repository-pattern*
---
*Observed: 2026-07-13T03:03:34.874Z*