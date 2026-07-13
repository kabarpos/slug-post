# Route Structure

All routes defined in **`routes/web.ts`** using HyperExpress Router.

## SEO Routes

| Method | Path | Controller | Notes |
|--------|------|-----------|-------|
| GET | `/sitemap.xml` | `SitemapController.sitemap` | XML sitemap |
| GET | `/robots.txt` | `SitemapController.robots` | Robots.txt |

## Public Pages

| Method | Path | Controller | Notes |
|--------|------|-----------|-------|
| GET | `/` | `HomeController.index` | Landing page (SSR) |
| GET | `/about` | `HomeController.about` | SSR |
| GET | `/docs` | `HomeController.docs` | SSR |
| GET | `/tos` | `HomeController.tos` | SSR |
| GET | `/privacy` | `HomeController.privacy` | SSR |

## Post Routes

| Method | Path | Controller | Notes |
|--------|------|-----------|-------|
| GET | `/api/check-slug/:slug` | `PostController.checkSlug` | Slug availability |
| POST | `/api/preview` | `PostController.preview` | Markdown preview |
| POST | `/publish` | `PostController.store` | OptionalAuth |
| GET | `/success` | `PostController.success` | Inertia |
| GET | `/:slug` | `PostController.show` | View post (SSR) |
| GET | `/:slug/edit/:token` | `PostController.edit` | Inertia |
| POST | `/:slug/edit/:token` | `PostController.update` | Update post |
| GET | `/:slug/settings/:token` | `PostController.settings` | Inertia |
| POST | `/:slug/settings/:token` | `PostController.updateSettings` | |
| GET | `/:slug/visual/:token` | `PostController.visualBuilder` | Inertia |
| GET | `/claim/:slug` | `PostController.claim` | Auth required |

## Auth Routes

| Method | Path | Controller | Notes |
|--------|------|-----------|-------|
| GET | `/login` | `AuthController.loginPage` | Inertia |
| POST | `/login` | `AuthController.processLogin` | |
| GET | `/register` | `AuthController.registerPage` | Inertia |
| POST | `/register` | `AuthController.processRegister` | |
| POST | `/logout` | `AuthController.logout` | |
| GET | `/google/redirect` | `AuthController.redirect` | Google OAuth |
| GET | `/google/callback` | `AuthController.googleCallback` | |
| GET | `/forgot-password` | `AuthController.forgotPasswordPage` | |
| POST | `/forgot-password` | `AuthController.sendResetPassword` | |
| GET | `/reset-password/:id` | `AuthController.resetPasswordPage` | |
| POST | `/reset-password` | `AuthController.resetPassword` | |

## Protected Routes (Auth Required)

| Method | Path | Controller | Notes |
|--------|------|-----------|-------|
| GET | `/home` | `AuthController.homePage` | Dashboard |
| GET | `/profile` | `AuthController.profilePage` | Inertia |
| POST | `/change-profile` | `AuthController.changeProfile` | |
| POST | `/change-password` | `AuthController.changePassword` | |
| GET | `/assets` | `AssetController.assetsPage` | Media library |
| DELETE | `/users` | `AuthController.deleteUsers` | Admin only |

## S3/Asset Routes

| Method | Path | Controller | Notes |
|--------|------|-----------|-------|
| POST | `/api/s3/signed-url` | `S3Controller.getSignedUrl` | Auth |
| GET | `/api/s3/public-url/:fileKey` | `S3Controller.getPublicUrl` | |
| GET | `/api/s3/health` | `S3Controller.health` | |
| POST | `/api/upload-thumbnail` | `AssetController.uploadThumbnail` | |
| GET | `/api/assets` | `AssetController.listAssets` | Auth |
| POST | `/api/assets/upload` | `AssetController.uploadAsset` | Auth |
| DELETE | `/api/assets/:id` | `AssetController.deleteAsset` | Auth |

## Static Asset Routes

| Method | Path | Controller | Notes |
|--------|------|-----------|-------|
| GET | `/assets/:file` | `AssetController.distFolder` | Vite build output |
| GET | `/public/*` | `AssetController.publicFolder` | Catch-all static files |

## Route Ordering (IMPORTANT)

1. SEO routes first
2. Public pages
3. Post dynamic routes (`/:slug/edit/:token`, `/:slug`)
4. Static asset routes LAST (catch-all)

## Related

- [[entities/slugpost-platform]]
- [[concepts/laju-architecture]]
