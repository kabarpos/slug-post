/**
 * Database Service — better-sqlite3 instance + helpers
 *
 * Replaces the old Knex-based DB.ts.
 * Knex stays as devDependency only for running migrations via CLI.
 */

import Database from "better-sqlite3";
import path from "path";

// Resolve database path from env
// Default: dev.sqlite3 for development, production.sqlite3 for production
const defaultDbFile =
	process.env.NODE_ENV === "production" ? "production.sqlite3" : "dev.sqlite3";
const dbPath = path.join(
	process.cwd(),
	"data",
	process.env.DB_FILENAME || defaultDbFile,
);

const db = new Database(dbPath);

// Performance & correctness PRAGMAs
db.pragma("journal_mode = WAL");
db.pragma("synchronous = NORMAL");
db.pragma("foreign_keys = ON");
db.pragma("cache_size = -8000"); // 8 MB page cache
db.pragma("temp_store = MEMORY");

export default db;
