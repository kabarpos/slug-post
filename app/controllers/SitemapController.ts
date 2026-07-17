import type { Request, Response } from "../../type";
import { posts } from "../repositories/posts";

class SitemapController {
	/**
	 * Generate RSS 2.0 Feed
	 * GET /rss.xml
	 */
	public async rss(request: Request, response: Response) {
		try {
			const baseUrl =
				process.env.APP_URL || `${request.protocol}://${request.hostname}`;
			const allPosts = posts.allPublished();

			let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
			xml += '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">\n';
			xml += "  <channel>\n";
			xml += `    <title>SlugPost</title>\n`;
			xml += `    <link>${baseUrl}</link>\n`;
			xml += `    <description>Publish and share your markdown files instantly with beautiful web previews</description>\n`;
			xml += `    <language>en</language>\n`;
			xml += `    <atom:link href="${baseUrl}/rss.xml" rel="self" type="application/rss+xml"/>\n`;
			xml += `    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>\n`;

			for (const post of allPosts) {
				const pubDate = new Date(post.created_at).toUTCString();
				const description = post.description
					? post.description.substring(0, 300)
					: "";
				xml += "    <item>\n";
				xml += `      <title>${escapeXml(post.title)}</title>\n`;
				xml += `      <link>${baseUrl}/${post.slug}</link>\n`;
				xml += `      <guid isPermaLink="true">${baseUrl}/${post.slug}</guid>\n`;
				xml += `      <pubDate>${pubDate}</pubDate>\n`;
				if (description) {
					xml += `      <description>${escapeXml(description)}</description>\n`;
				}
				xml += "    </item>\n";
			}

			xml += "  </channel>\n";
			xml += "</rss>\n";

			response.header("Content-Type", "application/rss+xml; charset=utf-8");
			response.header("Cache-Control", "public, max-age=3600");
			return response.send(xml);
		} catch (error) {
			console.error("Error generating RSS feed:", error);
			response.status(500);
			return response.send("Error generating RSS feed");
		}
	}

	/**
	 * Generate sitemap.xml
	 */
	public async sitemap(request: Request, response: Response) {
		try {
			const baseUrl =
				process.env.APP_URL || `${request.protocol}://${request.hostname}`;
			const allPosts = posts.allSlugs();

			const staticPages = [
				{ url: "/", priority: "1.0", changefreq: "daily" },
				{ url: "/about", priority: "0.8", changefreq: "monthly" },
				{ url: "/docs", priority: "0.8", changefreq: "monthly" },
			];

			let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
			xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

			for (const page of staticPages) {
				xml += "  <url>\n";
				xml += `    <loc>${baseUrl}${page.url}</loc>\n`;
				xml += `    <changefreq>${page.changefreq}</changefreq>\n`;
				xml += `    <priority>${page.priority}</priority>\n`;
				xml += "  </url>\n";
			}

			for (const post of allPosts) {
				const lastmod = post.updated_at || post.created_at;
				const formattedDate = new Date(lastmod).toISOString().split("T")[0];
				xml += "  <url>\n";
				xml += `    <loc>${baseUrl}/${post.slug}</loc>\n`;
				xml += `    <lastmod>${formattedDate}</lastmod>\n`;
				xml += `    <changefreq>weekly</changefreq>\n`;
				xml += `    <priority>0.7</priority>\n`;
				xml += "  </url>\n";
			}

			xml += "</urlset>";

			response.header("Content-Type", "application/xml; charset=utf-8");
			response.header("Cache-Control", "public, max-age=3600");
			return response.send(xml);
		} catch (error) {
			console.error("Error generating sitemap:", error);
			response.status(500);
			return response.send("Error generating sitemap");
		}
	}

	/**
	 * Generate robots.txt
	 */
	public async robots(request: Request, response: Response) {
		const baseUrl =
			process.env.APP_URL || `${request.protocol}://${request.hostname}`;
		const robotsTxt = `User-agent: *
Allow: /
Disallow: /login
Disallow: /register
Disallow: /profile
Disallow: /home
Disallow: /forgot-password
Disallow: /reset-password
Disallow: /api/
Disallow: /*/edit/*

Sitemap: ${baseUrl}/sitemap.xml
`;
		response.header("Content-Type", "text/plain; charset=utf-8");
		response.header("Cache-Control", "public, max-age=86400");
		return response.send(robotsTxt);
	}
}

export default new SitemapController();

/** Escape XML special characters */
function escapeXml(str: string): string {
	return str
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&apos;");
}
