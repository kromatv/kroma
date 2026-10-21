# RFC NNNN: the web client loads an API domain when it first calls it

- Status: **REJECTED**
- PR: #400
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

- Whether `packages/tv`'s web shells (Tizen, webOS) take the lazy path too: their bundles
  are local files, so an extra chunk costs a disk read, not a network round trip, and the
  oldest engines may handle dynamic `import()` badly. Decided when it is built, with the
  deep tier's compat guard as the judge.
- The exact saving, to be measured on the built entry chunk once the first two domains move.

## Outcome

Built on `perf/lazy-client-domains` and measured, then dropped. The entry chunk went from
421.6 to 418.9 KB gzipped, 2.7 KB rather than the 57 KB estimated: pages import their
schemas and ids directly through `@kromatv/client/<domain>`, so the schemas stay on first
paint and only each domain's `client.ts` left it. For that, every namespace gained a lazy
stand-in, two domains a `urls.ts`, query keys a path tree, and a TV test a preload to wait
out the first import. Not worth it. A real saving would have to move the pages' own schema
imports, which is a different proposal.
