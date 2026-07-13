import type { Response, Request } from "../../type";
import { view } from "../services/View";
import { sessions } from "../repositories/sessions";
import { users } from "../repositories/users";

class Controller {
	public async index(request: Request, response: Response) {
		// Check if user is logged in
		if (request.cookies.auth_id) {
			const session = sessions.findById(request.cookies.auth_id);
			if (session) {
				const user = users.findByIdLight(session.user_id);
				if (user) {
					return response.inertia("CreatePost", { user });
				}
			}
		}

		// Not logged in - show public HTML page
		return response.type("html").send(view("index.html"));
	}

	public async about(request: Request, response: Response) {
		return response.type("html").send(view("about.html"));
	}

	public async docs(request: Request, response: Response) {
		return response.type("html").send(view("docs.html"));
	}

	public async tos(request: Request, response: Response) {
		return response.type("html").send(view("tos.html"));
	}

	public async privacy(request: Request, response: Response) {
		return response.type("html").send(view("privacy.html"));
	}
}

export default new Controller();
