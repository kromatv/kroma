# RFC NNNN: the web client loads an API domain when it first calls it

- Status: **ACCEPTED**
- PR: #NNNN
- Affects: `packages/client` (`api/discover.web.ts`, `core/client.ts`, every
  `api/<domain>/client.ts`), `clients/web`

## Summary

The web build stops binding all 20 API domains when `KromaClient` is created. Each
namespace (`client.media`, `client.admin`, ...) stays where it is with the same type, but
on the web it is a stand-in that imports the domain's `client.ts`, and the zod schemas
behind it, on its first call. The few members that answer synchronously (URL builders such
as `media.streamUrl`) move to a small eager half of the domain. Native builds keep binding
everything eagerly, since Metro ships one bundle and splitting buys nothing there.

## Motivation

Every page of the web client loads the code of every API domain before it paints. Measured
on main with `vite build --sourcemap`: 186 KB of the entry chunk's source is
`packages/client/src/api/*`, from all 20 domains (largest: `media` 29 KB, `accounts` 26,
`admin` 24, `requests` 16). The domains' sources come to about 57 KB gzipped. A member who
opens the home page pays for the admin, monitoring, pipeline, reports and LLM schemas,
which only an owner on an admin page ever uses.

The cause is `api/discover.web.ts`: it globs `./*/client.ts` with `eager: true`, and
`bindDomains` calls every factory up front. Loading `domainModules` lazily in
`clients/web/src/modules/remotes.ts` was tried and changed nothing, so the eager glob is
the whole of it.

## Proposal

1. **Two halves per domain.** A domain's sync members (URL builders, anything that does not
   return a promise) move from `client.ts` to `urls.ts`, which imports no zod. `client.ts`
   keeps the async calls and the schemas. A domain with no sync member has no `urls.ts`.
2. **Web discovery globs lazily.** `discover.web.ts` globs `./*/client.ts` without
   `eager`, and `./*/urls.ts` eagerly.
3. **A stand-in per namespace.** On the web, `bindDomains` builds each namespace as an
   object whose async members are wrappers: the first call to any of them imports the
   domain's `client.ts`, binds it to the same `RequestContext`, and forwards; later calls
   go straight to the bound object. Sync members come from `urls.ts`, bound eagerly. The
   `Domains` interface does not change, so no call site changes.
4. **Preloading stays possible.** A route that knows it needs a domain can call
   `client.preload('admin')` in its loader, so the import overlaps the route's own chunk
   instead of following it.
5. **Native is untouched.** `discover.ts` (Metro) keeps its eager `require.context`.

## What this costs

- One `urls.ts` per domain that has sync members, and a rule to keep them there: a sync
  member added to `client.ts` would silently become async on the web. A unit test that
  binds every domain on the web path and asserts every `client.ts` member returns a promise
  catches it.
- The first call into a domain waits for one extra request. On a route whose loader calls
  the domain, `preload` hides it; elsewhere it is one small chunk on a warm connection.
- `bindDomains` gains a web-only code path, which the vitest `web` project covers and the
  `native` project does not.

## Compatibility

No call site and no type changes. Modules keep receiving every `@kromatv/client/<domain>`
module through `provideShared`, which already loads on demand. Nothing on the wire changes.

## Alternatives

- **An async namespace** (`await client.media()`) makes the loading explicit but rewrites
  roughly 160 call sites across `clients/web` and `packages/tv`.
- **Route-level schema imports**, each page importing only the domains it uses, gives the
  best split but drops the single `KromaClient` the codebase is built around.
- **Do nothing.** About 57 KB gzipped stays on every first paint; the gap grows with each
  domain added.

## Unresolved

- Whether `packages/tv`'s web shells (Tizen, webOS) take the lazy path too. They do: the
  modern tier splits like the web client, and the legacy and deep tiers build with
  `inlineDynamicImports`, so the stand-in's `import()` folds into the one classic file.
  The compat guard passes the legacy bundle for Chromium 53 and the deep one for 47.
- The exact saving, measured on `clients/web`'s entry chunk with `vite build --sourcemap`:
  1351.2 KB raw and 421.6 KB gzipped before, 1336.5 KB and 418.9 KB after. The entry's
  `packages/client/src/api/*` source drops from 187.3 KB to 111.8 KB, and every domain's
  `client.ts` leaves it. Two things the estimate above missed. Each domain's `index.ts` did
  `export * from './client'`, a static edge that kept every `client.ts` in the entry; it is
  now `export type *`. And the schemas still in the entry (112 KB of source) stay because
  pages import them directly, through `@kromatv/client/<domain>`, for ids and parses. Moving
  those is per-page work this RFC does not cover.
