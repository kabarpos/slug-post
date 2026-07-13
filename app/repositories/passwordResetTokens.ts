/**
 * Password Reset Tokens Repository
 */
import db from "./db";

export interface PasswordResetToken {
	id: number;
	email: string;
	token: string;
	expires_at: string;
	created_at: string | null;
}

export const passwordResetTokens = {
	/** Find a valid (non-expired) token */
	findValid(token: string): PasswordResetToken | undefined {
		return db
			.prepare(
				"SELECT * FROM password_reset_tokens WHERE token = ? AND expires_at > datetime('now')",
			)
			.get(token) as PasswordResetToken | undefined;
	},

	/** Create a reset token */
	create(data: { email: string; token: string; expires_at: Date }) {
		return db
			.prepare(
				"INSERT INTO password_reset_tokens (email, token, expires_at) VALUES (?, ?, ?)",
			)
			.run(data.email, data.token, data.expires_at.toISOString());
	},

	/** Delete by token value */
	deleteByToken(token: string) {
		return db
			.prepare("DELETE FROM password_reset_tokens WHERE token = ?")
			.run(token);
	},
};
