/**
 * AuthController — handles authentication and account-related flows
 */
import Authenticate from "../services/Authenticate";
import { redirectParamsURL } from "../services/GoogleAuth";
import axios from "axios";
import dayjs from "dayjs";
import Mailer from "../services/Mailer";
import type { Response, Request } from "../../type";
import { randomUUID } from "crypto";
import { posts } from "../repositories/posts";
import { users } from "../repositories/users";
import { passwordResetTokens } from "../repositories/passwordResetTokens";
import { emailVerificationTokens } from "../repositories/emailVerificationTokens";

class AuthController {
	public async registerPage(request: Request, response: Response) {
		if (request.cookies.auth_id) {
			return response.redirect("/home");
		}
		return response.inertia("auth/register");
	}

	public async homePage(request: Request, response: Response) {
		const userPosts = posts.findByAuthor(request.user.id);
		return response.inertia("home", { posts: userPosts });
	}

	public async deleteUsers(request: Request, response: Response) {
		const { ids } = request.body;
		if (!Array.isArray(ids)) {
			return response.status(400).json({ error: "Invalid request format" });
		}
		if (!request.user.is_admin) {
			return response.status(403).json({ error: "Unauthorized" });
		}
		users.deleteByIds(ids);
		return response.redirect("/home");
	}

	public async profilePage(request: Request, response: Response) {
		return response.inertia("profile");
	}

	public async changeProfile(request: Request, response: Response) {
		const data = await request.json();
		users.updateProfile(request.user.id, {
			name: data.name,
			email: data.email.toLowerCase(),
			phone: data.phone,
		});
		return response.json({ message: "Your profile has been updated" });
	}

	public async changePassword(request: Request, response: Response) {
		const data = await request.json();
		const user = users.findById(request.user.id);

		if (!user) {
			return response.status(400).json({ message: "User not found" });
		}

		const passwordMatch = await Authenticate.compare(
			data.current_password,
			user.password,
		);

		if (passwordMatch) {
			users.updatePassword(
				request.user.id,
				await Authenticate.hash(data.new_password),
			);
			return response.json({ message: "Password updated successfully" });
		} else {
			return response
				.status(400)
				.json({ message: "Password lama tidak cocok" });
		}
	}

	public async forgotPasswordPage(request: Request, response: Response) {
		return response.inertia("auth/forgot-password");
	}

	public async resetPasswordPage(request: Request, response: Response) {
		const id = request.params.id;
		const token = passwordResetTokens.findValid(id);

		if (!token) {
			return response
				.status(404)
				.send("Link tidak valid atau sudah kadaluarsa");
		}

		return response.inertia("auth/reset-password", { id: request.params.id });
	}

	public async resetPassword(request: Request, response: Response) {
		const { id, password } = await request.json();
		const token = passwordResetTokens.findValid(id);

		if (!token) {
			return response
				.status(404)
				.send("Link tidak valid atau sudah kadaluarsa");
		}

		const user = users.findByEmail(token.email);
		if (!user) {
			return response.status(404).send("User not found");
		}

		users.updatePassword(user.id, await Authenticate.hash(password));
		passwordResetTokens.deleteByToken(id);

		return Authenticate.process(user, request, response);
	}

	public async sendResetPassword(request: Request, response: Response) {
		const { email, phone } = await request.json();

		let user;

		if (email && email.includes("@")) {
			user = users.findByEmail(email);
		} else if (phone) {
			user = users.findByPhone(phone);
		}

		if (!user) {
			return response.status(404).send("Email tidak terdaftar");
		}

		const token = randomUUID();

		passwordResetTokens.create({
			email: user.email,
			token,
			expires_at: dayjs().add(24, "hours").toDate(),
		});

		try {
			await Mailer.sendMail({
				from: process.env.USER_MAILER,
				to: email,
				subject: "Reset Password",
				text: `You have requested a password reset. If this was you, please click the following link:
      
        ${process.env.APP_URL}/reset-password/${token}
        
        If you did not request a password reset, please ignore this email.
        
        This link will expire in 24 hours.
              `,
			});
		} catch (error) {
			console.error("Email send error:", error);
		}

		try {
			if (user.phone) {
				await axios.post("https://api.dripsender.id/send", {
					api_key: "DRIPSENDER_API_KEY",
					phone: user.phone,
					text: `You have requested a password reset. If this was you, please click the following link:
      
${process.env.APP_URL}/reset-password/${token}
          
If you did not request a password reset, please ignore this message.

This link will expire in 24 hours.
                `,
				});
			}
		} catch (error) {
			console.error("SMS send error:", error);
		}

		return response.send("OK");
	}

	public async loginPage(request: Request, response: Response) {
		return response.inertia("auth/login");
	}

	public async redirect(request: Request, response: Response) {
		const params = redirectParamsURL();
		const googleLoginUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
		return response.redirect(googleLoginUrl);
	}

	public async googleCallback(request: Request, response: Response) {
		const { code } = request.query;

		const { data } = await axios({
			url: `https://oauth2.googleapis.com/token`,
			method: "post",
			data: {
				client_id: process.env.GOOGLE_CLIENT_ID,
				client_secret: process.env.GOOGLE_CLIENT_SECRET,
				redirect_uri: process.env.GOOGLE_REDIRECT_URI,
				grant_type: "authorization_code",
				code,
			},
		});

		const result = await axios({
			url: "https://www.googleapis.com/oauth2/v2/userinfo",
			method: "get",
			headers: {
				Authorization: `Bearer ${data.access_token}`,
			},
		});

		let { email, name, verified_email } = result.data;
		email = email.toLowerCase();

		const existingUser = users.findByEmail(email);

		if (existingUser) {
			return Authenticate.process(existingUser, request, response);
		} else {
			const userId = randomUUID();
			users.create({
				id: userId,
				email,
				password: await Authenticate.hash(email),
				name,
			});
			if (verified_email) {
				users.markVerified(userId);
			}
			return Authenticate.process(
				{ id: userId, email, name, password: "" },
				request,
				response,
			);
		}
	}

	public async processLogin(request: Request, response: Response) {
		const body = await request.json();
		const { email, password, phone } = body;

		let user;

		if (email && email.includes("@")) {
			user = users.findByEmail(email);
		} else if (phone) {
			user = users.findByPhone(phone);
		}

		if (user) {
			const passwordMatch = await Authenticate.compare(password, user.password);
			if (passwordMatch) {
				return Authenticate.process(user, request, response);
			} else {
				return response
					.cookie("error", "Maaf, Password salah", 3000)
					.redirect("/login");
			}
		} else {
			return response
				.cookie("error", "Email/No.HP tidak terdaftar", 3000)
				.redirect("/login");
		}
	}

	public async processRegister(request: Request, response: Response) {
		let { email, password, name } = await request.json();
		email = email.toLowerCase();

		try {
			const user = {
				id: randomUUID(),
				email,
				name,
				password: await Authenticate.hash(password),
			};
			users.create(user);
			return Authenticate.process(user, request, response);
		} catch (error) {
			console.error(error);
			return response
				.cookie("error", "Maaf, Email sudah terdaftar", 3000)
				.redirect("/register");
		}
	}

	public async verify(request: Request, response: Response) {
		const token = randomUUID();

		emailVerificationTokens.deleteByUserId(request.user.id);
		emailVerificationTokens.create({
			user_id: request.user.id,
			token,
			expires_at: dayjs().add(24, "hours").toDate(),
		});

		try {
			await Mailer.sendMail({
				from: process.env.USER_MAILER,
				to: request.user.email,
				subject: "Verifikasi Akun",
				text: `Klik link berikut untuk verifikasi email anda:
${process.env.APP_URL}/verify/${token}

Link ini akan kadaluarsa dalam 24 jam.`,
			});
		} catch (error) {
			console.error(error);
		}

		return response.redirect("/home");
	}

	public async verifyPage(request: Request, response: Response) {
		const { id } = request.params;

		const verificationToken = emailVerificationTokens.findValid(
			request.user.id,
			id,
		);

		if (verificationToken) {
			users.markVerified(request.user.id);
			emailVerificationTokens.deleteById(verificationToken.id);
		}

		return response.redirect("/home?verified=true");
	}

	public async logout(request: Request, response: Response) {
		if (request.cookies.auth_id) {
			await Authenticate.logout(request, response);
		}
	}
}

export default new AuthController();
