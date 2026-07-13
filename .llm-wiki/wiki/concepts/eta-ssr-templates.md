# Eta Template Engine (SSR)

Used for SEO-critical pages (home, about, post view). Templates in `resources/views/` as `.html` files.

## Eta Syntax

| Syntax | Description |
|--------|-------------|
| `<%= title %>` | Escaped output |
| `<%~ content %>` | Unescaped (raw HTML) — trusted content only |
| `<% if (user) { %>...<% } %>` | Conditionals |
| `<% for (const item of items) { %>...<% } %>` | Loops |
| `<%~ include('partials/header.html') %>` | Partials |
| `<%= title \|\| "Default" %>` | Default values |

## Asset Helper

```html
<script type="module" src="<%= it.asset('js/index.js') %>"></script>
<link rel="stylesheet" href="<%= it.asset('js/index.css') %>">
```

- **Dev:** serves from Vite dev server at `VITE_PORT`
- **Prod:** serves from Vite manifest in `dist/.vite/manifest.json`

## Inertia App Shell (`inertia.html`)

```html
<!DOCTYPE html>
<html>
<head>
   <title><%= title %></title>
   <%= inertiaHead %>
</head>
<body>
   <div id="app"></div>
   <script src="/js/app.js"></script>
</body>
</html>
```

## Automatic View Variables
- `base_url` — `APP_URL` from env
- `current_year` — `new Date().getFullYear()`
- `asset(file)` — resolves dev/prod asset paths

## Available Templates
- `index.html` — landing page
- `post.html` — post view (markdown rendered)
- `about.html`, `docs.html`, `privacy.html`, `tos.html` — static pages
- `inertia.html` — Inertia.js Svelte app shell
- `partials/footer.html`, `partials/navbar.html` — reusable components

## Best Practices
- Keep templates simple — move logic to controllers
- Use partials for reusable components
- Eta auto-escapes by default (XSS protection)
- Use semantic HTML5 elements
- Single `<h1>` per page, logical heading hierarchy

## Icons in Eta Templates
Use inline SVG (copy from [lucide.dev](https://lucide.dev/icons)):
```html
<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-5 h-5">
  <circle cx="12" cy="12" r="10"></circle>
  <line x1="12" y1="8" x2="12" y2="12"></line>
</svg>
```

For Inertia pages (Svelte), use `lucide-svelte` instead.

## Related
- [[concepts/laju-architecture]]
- [[concepts/code-conventions]]
