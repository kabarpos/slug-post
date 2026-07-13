import { sessions } from "../repositories/sessions";
import { users } from "../repositories/users";
import type { Request, Response } from "../../type";

/**
 * Optional Auth Middleware
 * Sets user data if authenticated, but doesn't redirect if not
 * Used for routes that work for both authenticated and guest users
 */
export default async (request: Request, response: Response) => {
	if (request.cookies.auth_id) {
		const session = sessions.findById(request.cookies.auth_id);

		if (session) {
			const user = users.findByIdAuth(session.user_id);
			if (user) {
				request.user = user;
				request.share = {
					user: request.user,
				};
			}
		}
	}
	// Don't redirect if not authenticated - just continue
};
