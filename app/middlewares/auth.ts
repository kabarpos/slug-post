import { sessions } from "../repositories/sessions";
import { users } from "../repositories/users";
import type { Request, Response } from "../../type";

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
				return;
			}
		}

		// Invalid session — clear cookie and redirect
		response.cookie("auth_id", "", 0).redirect("/login");
	} else {
		response.cookie("auth_id", "", 0).redirect("/login");
	}
};
