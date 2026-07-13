/**
 * Assets Repository — all database queries for the assets table
 */
import db from "./db";

export interface Asset {
	id: string;
	type: string;
	url: string;
	mime_type: string;
	name: string;
	size: number;
	user_id: string;
	s3_key: string | null;
	created_at: number;
	updated_at: number;
}

export const assets = {
	/** Insert a new asset */
	create(data: {
		id: string;
		type: string;
		url: string;
		mime_type: string;
		name: string;
		size: number;
		user_id: string;
		s3_key?: string;
		created_at: number;
		updated_at: number;
	}) {
		return db
			.prepare(
				`INSERT INTO assets (id, type, url, mime_type, name, size, user_id, s3_key, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			)
			.run(
				data.id,
				data.type,
				data.url,
				data.mime_type,
				data.name,
				data.size,
				data.user_id,
				data.s3_key || null,
				data.created_at,
				data.updated_at,
			);
	},

	/** List assets by user, newest first */
	findByUser(userId: string, limit = 50): Asset[] {
		return db
			.prepare(
				"SELECT * FROM assets WHERE user_id = ? ORDER BY created_at DESC LIMIT ?",
			)
			.all(userId, limit) as Asset[];
	},

	/** Find a single asset by id AND verify ownership */
	findByIdAndUser(id: string, userId: string): Asset | undefined {
		return db
			.prepare("SELECT * FROM assets WHERE id = ? AND user_id = ?")
			.get(id, userId) as Asset | undefined;
	},

	/** Delete an asset by id AND verify ownership */
	deleteByIdAndUser(id: string, userId: string) {
		return db
			.prepare("DELETE FROM assets WHERE id = ? AND user_id = ?")
			.run(id, userId);
	},
};
