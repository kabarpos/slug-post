/**
 * Email Verification Tokens Repository
 */
import db from "./db";

export interface EmailVerificationToken {
	id: number;
	user_id: string;
	token: string;
	expires_at: string;
	created_at: string | null;
}

export const emailVerificationTokens = {
	/** Find a valid token for a user */
	findValid(userId: string, token: string): EmailVerificationToken | undefined {
		return db
			.prepare(
				"SELECT * FROM email_verification_tokens WHERE user_id = ? AND token = ? AND expires_at > datetime('now')",
			)
			.get(userId, token) as EmailVerificationToken | undefined;
	},

	/** Delete all tokens for a user */
	deleteByUserId(userId: string) {
		return db
			.prepare("DELETE FROM email_verification_tokens WHERE user_id = ?")
			.run(userId);
	},

	/** Delete a single token by id */
	deleteById(id: number) {
		return db
			.prepare("DELETE FROM email_verification_tokens WHERE id = ?")
			.run(id);
	},

	/** Create a verification token */
	create(data: { user_id: string; token: string; expires_at: Date }) {
		return db
			.prepare(
				"INSERT INTO email_verification_tokens (user_id, token, expires_at) VALUES (?, ?, ?)",
			)
			.run(data.user_id, data.token, data.expires_at.toISOString());
	},
};
