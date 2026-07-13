/**
 * Sessions Repository — all database queries for the sessions table
 */
import db from "./db";

export interface Session {
	id: string;
	user_id: string;
	ip_address: string | null;
	user_agent: string | null;
	payload: string | null;
	last_activity: number | null;
}

export const sessions = {
	/** Find session by id */
	findById(id: string): Session | undefined {
		return db.prepare("SELECT * FROM sessions WHERE id = ?").get(id) as
			| Session
			| undefined;
	},

	/** Create a new session */
	create(data: { id: string; user_id: string; user_agent?: string }) {
		return db
			.prepare(
				"INSERT INTO sessions (id, user_id, user_agent) VALUES (?, ?, ?)",
			)
			.run(data.id, data.user_id, data.user_agent || null);
	},

	/** Delete a session by id */
	deleteById(id: string) {
		return db.prepare("DELETE FROM sessions WHERE id = ?").run(id);
	},
};
