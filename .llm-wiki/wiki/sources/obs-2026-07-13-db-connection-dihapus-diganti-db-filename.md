---
type: source
title: "Observation: DB_CONNECTION dihapus, diganti DB_FILENAME"
slug: obs-2026-07-13-db-connection-dihapus-diganti-db-filename
status: observation
created: 2026-07-13
updated: 2026-07-13
relevance: medium
observed_at: 2026-07-13T03:08:59.929Z
tags: ["slugpost", "env", "database", "refactor"]
---
# 🔍 Observation: DB_CONNECTION dihapus, diganti DB_FILENAME
DB_CONNECTION env var tidak lagi diperlukan sejak migrasi dari Knex runtime ke better-sqlite3 langsung.

Runtime (app/repositories/db.ts):
- Default: dev.sqlite3 (development) / production.sqlite3 (production)
- Override: DB_FILENAME env var
- Path: ./data/{DB_FILENAME || auto}

Knex (devDependency untuk CLI migration):
- knexfile.ts disederhanakan jadi single config
- Menggunakan logika DB_FILENAME / NODE_ENV yang sama
- CLI command: npx knex migrate:latest (pakai default env 'development')

.env sekarang lebih sederhana — cukup set DB_FILENAME untuk custom path.
*Relevance: medium*

*Tags: slugpost env database refactor*
---
*Observed: 2026-07-13T03:08:59.929Z*