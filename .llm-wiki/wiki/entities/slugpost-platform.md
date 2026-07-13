# SlugPost — Markdown Publishing Platform

## Overview

SlugPost is a high-performance, full-stack TypeScript web application for **instant markdown publishing**. Users paste/share markdown content as beautiful web pages with custom URLs — no registration required.

- **Live:** [slugpost.com](https://slugpost.com)
- **Repository:** [github.com/maulanashalihin/slug-post](https://github.com/maulanashalihin/slug-post)
- **Author:** Maulana Shalihin

## Core Features

- Instant markdown publishing (paste or upload .md file)
- Custom URL slugs with availability check
- No registration required (anonymous posting)
- Secure edit links with unique UUID tokens (shown once)
- Post claiming: anonymous → claimed by registered user
- Auto-claim when logged in during publish
- User dashboard with claimed post management
- Author attribution on claimed posts
- View counter with last-viewed timestamp
- HTML content publishing support
- Google OAuth integration
- Password reset via email

## Tech Stack

- **Framework:** Laju (custom — HyperExpress + Svelte 5 + Inertia.js)
- **Backend:** HyperExpress (HTTP), better-sqlite3 (DB via `app/repositories/`)
- **Frontend:** Svelte 5, Inertia.js v2, TailwindCSS, Vite
- **Templating:** Eta (SSR for SEO pages), Squirrelly
- **Markdown:** markdown-it + highlight.js + markdown-it-anchor
- **Auth:** Email/password (bcrypt) + Google OAuth
- **Assets:** S3-compatible storage (Wasabi/S3)
- **Email:** Nodemailer
- **Cache:** Redis (optional)

## Design Philosophy

- **Less is More** — minimal color palette (blue primary, slate neutrals, orange warnings only)
- **Mobile-first** responsive design
- **Dark mode** support (in progress)
- **Clean editorial** aesthetic with @tailwindcss/typography

## Related Concepts

- [[concepts/laju-architecture]]
- [[concepts/route-structure]]
- [[concepts/code-conventions]]
- [[concepts/database-schema]]
- [[concepts/dev-workflow]]
