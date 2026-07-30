<div align="center">
  <img src="../../.github/assets/logo.svg" alt="KROMA" height="52">
  <h1>@kroma/site</h1>
  <p><i>The KROMA showcase site — kroma.tv. Marketing pages + an MD/MDX blog, prerendered to static HTML on Cloudflare.</i></p>
</div>

> Part of the [KROMA](../../README.md) monorepo. It reuses the design system from
> [`@kroma/ui`](../../packages/ui/README.md) — the same deep-charcoal + amber
> tokens, the same two type families — so the site renders in the exact brand of
> the app, with no second source of truth.

## What it is

A **TanStack Start** app built in **fully static** mode: every page is prerendered
to its own `index.html` at build time (no server runtime), so Cloudflare serves it
straight from the edge — the same assets-only pattern as [`clients/tv-web`](../tv-web).
Chosen because it matches the house web stack ([`clients/web`](../web) is also
TanStack Start) while giving a marketing site the SEO of real per-page HTML.

- **Framework:** TanStack Start + TanStack Router (file-based routes in `src/routes`).
- **Styling:** Tailwind **v4**, importing `@kroma/ui/tailwind.css` (the kit's
  `@theme`) — utilities like `bg-bg`, `text-accent`, `font-display` are the KROMA tokens.
- **Blog:** `.mdx` files in [`content/blog/`](./content/blog), compiled with
  `@mdx-js/rollup` (frontmatter, GFM, anchored headings, Shiki code). See the
  [authoring guide](./content/blog/README.md).
- **i18n:** [Paraglide JS](https://paraglidejs.com) — English at the root, every
  other locale under its own prefix (`/fr`, `/fr/download`). The locale is a pure
  function of the URL, so each one prerenders to its own HTML. See [Languages](#languages).

## Develop

```bash
bun install                          # from the repo root, once
bun run --filter '@kroma/site' dev   # http://localhost:3100
```

Other scripts (run with `bun run --filter '@kroma/site' <script>`):

| Script | What it does |
| --- | --- |
| `dev` | Vite dev server on :3100 |
| `build` | Prerender every page → `dist/client` (static) |
| `preview` | Serve the built output locally |
| `preview:edge` | Serve it through `wrangler dev` (the real edge runtime) |
| `typecheck` | `tsr generate` + `tsc --noEmit` |
| `og` | Redraw the per-locale social cards (Satori) |
| `deploy` | Build, then `wrangler deploy` |

## Add a page

Drop a file in `src/routes/` — it becomes a route by its path
(`src/routes/about.tsx` → `/about`). Give it a `head` that spreads `seo(...)` from
[`src/lib/seo.ts`](./src/lib/seo.ts) so it ships a complete title + Open Graph
card, and it will be picked up by the prerender crawl as long as something links
to it.

## Add a blog post

Create one `.mdx` file in [`content/blog/`](./content/blog) with a frontmatter
block. That's the whole workflow — it's discovered, prerendered, dated and
sorted automatically. Full details and the frontmatter fields are in the
[authoring guide](./content/blog/README.md).

## Languages

i18n is [**Paraglide JS**](https://paraglidejs.com) (inlang). Strings never live in
components: the words are in `messages/<locale>.json`, and a component calls a
generated, typed function for the one it needs.

```
messages/
  en.json      the base locale — 278 keys
  fr.json      the same 278 keys, in French
project.inlang/settings.json    the locale list
```

```tsx
import { m } from '#site/paraglide/messages';

<h2>{m.home_features_title()}</h2>
```

Paraglide compiles those JSON files into one tree-shakeable module per message
(`src/paraglide/`, generated and git-ignored), so a page only ships the strings it
actually renders, and `tsc` knows every key.

**Routes are not localized — URLs are.** The router carries a `rewrite` pair
(`deLocalizeUrl` in, `localizeUrl` out), so `/download` is declared once and
`/fr/download` resolves to it while every href the router generates keeps the
reader's language. There is no `routes/fr/` mirror to maintain.

The locale comes from the URL and nothing else (`strategy: ['url']`) — no cookie,
no `Accept-Language`. That is a requirement, not a preference: the site is
prerendered to static files, so a page must be one language per URL or the HTML on
the CDN would contradict the address that served it.

### Adding a language

1. Add its code to `locales` in [`project.inlang/settings.json`](./project.inlang/settings.json),
   its prefix to `urlPatterns` in [`vite.config.ts`](./vite.config.ts), and a name
   to `localeNames` / `localeShort` in [`src/lib/i18n.ts`](./src/lib/i18n.ts).
2. Copy `messages/en.json` to `messages/<locale>.json` and translate the values.
3. Add its card to `CARDS` in [`scripts/og.tsx`](./scripts/og.tsx) and run
   `bun run og`.

The routes, the `/xx/*` URLs, the switcher, the `hreflang` set and the per-locale
prerender all follow. No component changes.

> Paraglide falls back to the base locale for a key a translation is missing, so a
> forgotten string ships as English rather than as an error. Check parity by
> diffing the two key sets before you publish.

### Rich text in a message

Messages are plain strings, so markup travels as three markers, parsed by
[`src/lib/rich.ts`](./src/lib/rich.ts) and rendered by `<Rich>`:

| Marker | Renders as |
| --- | --- |
| `[amber]` | the brand accent |
| `` `mono` `` | inline code — a command, a codec, an env var |
| `*bright*` | full-strength text, for an OS or product name |

A heading therefore stays ONE translatable sentence (`'Six containers. [One
server.]'`) instead of three fragments that only reassemble in English word order.

### Long-form and blog content

Prose is not a message catalog's job. The privacy policy is MDX per locale in
[`content/legal/`](./content/legal), and blog posts are MDX per locale in
[`content/blog/`](./content/blog) (`my-post.fr.mdx` beside `my-post.mdx`, same
slug). Either falls back to the base-locale file when a translation is missing, so
a reader gets the page rather than a 404 — see the
[authoring guide](./content/blog/README.md).

## Social cards

`bun run og` renders `public/og.png` and `public/og.fr.png` from a **TSX
component** ([`scripts/og-card.tsx`](./scripts/og-card.tsx)) with
[Satori](https://github.com/vercel/satori) (JSX → SVG) and resvg (SVG → PNG). No
browser and no network: the brand faces are read from `@kroma/ui`'s own font files,
and the colours come from its tokens, so a card cannot drift from the design.

A card is an image, so it cannot be translated at request time — one per locale is
the only way a link shared in French previews in French.

## Deploy

The site is an **assets-only Cloudflare Worker** ([`wrangler.jsonc`](./wrangler.jsonc)),
served at `kroma.tv` + `www.kroma.tv` (the 10-foot app lives at `tv.kroma.tv` —
see `clients/tv-web`). Requires the `kroma.tv` zone on the Cloudflare account;
`wrangler` provisions the custom domains on deploy.

```bash
bun run --filter '@kroma/site' deploy
# or, if dist/ is already built:
cd clients/site && bunx wrangler@4 deploy
```

## Layout

```
clients/site/
├─ content/blog/       the blog, one .mdx per post + .<lang>.mdx translations
├─ content/legal/      the privacy policy, as MDX per locale
├─ messages/           the Paraglide catalogs, one .json per locale
├─ scripts/og.tsx      the social-card generator (Satori, JSX -> SVG -> PNG)
├─ public/             static assets served as-is (favicon, og image, robots)
├─ src/
│  ├─ components/      site chrome + per-page section components (Tailwind v4)
│  ├─ lib/
│  │  ├─ i18n.ts       the app-shaped adapter over Paraglide's runtime
│  │  ├─ rich.ts       the [amber]/`mono`/*bright* marker parser
│  │  ├─ legal.ts      resolves content/legal into a per-locale component
│  │  ├─ blog.ts       resolves content/blog into typed posts
│  │  ├─ seo.ts        the <head> helper (title, canonical, OG, hreflang)
│  │  └─ site.ts       the domain, contact addresses and nav
│  ├─ routes/          file-based routes (home, download, blog, privacy, support)
│  └─ styles.css       imports @kroma/ui/tailwind.css + site-only @utility/@theme
├─ vite.config.ts      TanStack Start (static prerender) + MDX pipeline
└─ wrangler.jsonc      assets-only Cloudflare Worker (kroma.tv)
```
