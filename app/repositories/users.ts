/**
 * Users Repository — all database queries for the users table
 */
import db from "./db";

export interface User {
	id: string;
	name: string;
	email: string;
	phone: string | null;
	password: string;
	is_verified: number;
	is_admin: number;
	membership_date: number | null;
	remember_me_token: string | null;
	created_at: number;
	updated_at: number;
}

export const users = {
	/** Find user by primary key */
	findById(id: string): User | undefined {
		return db.prepare("SELECT * FROM users WHERE id = ?").get(id) as
			| User
			| undefined;
	},

	/** Find user by email */
	findByEmail(email: string): User | undefined {
		return db
			.prepare("SELECT * FROM users WHERE email = ?")
			.get(email.toLowerCase()) as User | undefined;
	},

	/** Find user by phone number */
	findByPhone(phone: string): User | undefined {
		return db.prepare("SELECT * FROM users WHERE phone = ?").get(phone) as
			| User
			| undefined;
	},

	/** Lightweight select (no password) */
	findByIdLight(id: string): Pick<User, "id" | "name" | "email"> | undefined {
		return db
			.prepare("SELECT id, name, email FROM users WHERE id = ?")
			.get(id) as Pick<User, "id" | "name" | "email"> | undefined;
	},

	/** Lightweight select with auth fields */
	findByIdAuth(
		id: string,
	):
		| Pick<User, "id" | "name" | "email" | "phone" | "is_admin" | "is_verified">
		| undefined {
		return db
			.prepare(
				"SELECT id, name, email, phone, is_admin, is_verified FROM users WHERE id = ?",
			)
			.get(id) as any;
	},

	/** Create a new user */
	create(data: {
		id: string;
		name: string;
		email: string;
		password: string;
		phone?: string;
	}) {
		const stmt = db.prepare(`
      INSERT INTO users (id, name, email, phone, password, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
		const now = Date.now();
		return stmt.run(
			data.id,
			data.name,
			data.email.toLowerCase(),
			data.phone || null,
			data.password,
			now,
			now,
		);
	},

	/** Update user profile */
	updateProfile(
		id: string,
		data: { name: string; email: string; phone: string },
	) {
		return db
			.prepare(
				"UPDATE users SET name = ?, email = ?, phone = ?, updated_at = ? WHERE id = ?",
			)
			.run(data.name, data.email.toLowerCase(), data.phone, Date.now(), id);
	},

	/** Update password */
	updatePassword(id: string, hashedPassword: string) {
		return db
			.prepare("UPDATE users SET password = ?, updated_at = ? WHERE id = ?")
			.run(hashedPassword, Date.now(), id);
	},

	/** Mark user as verified */
	markVerified(id: string) {
		return db
			.prepare("UPDATE users SET is_verified = 1, updated_at = ? WHERE id = ?")
			.run(Date.now(), id);
	},

	/** Delete users by id array (admin only) */
	deleteByIds(ids: string[]) {
		const placeholders = ids.map(() => "?").join(",");
		return db
			.prepare(`DELETE FROM users WHERE id IN (${placeholders})`)
			.run(...ids);
	},
};
