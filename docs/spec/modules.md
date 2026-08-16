# Modules

Status: **DRAFT** — skeleton only, nothing here is agreed yet.

The base build ships **zero modules** — `modules/roster.yaml` is deliberately empty — and
every first-party capability arrives as an installable `.kmod` whose backend runs
out-of-process. This is what makes every module uninstallable from Admin. That decision is
load-bearing for the whole product, so it earns a spec file.

## Scope

- What a module may and may not do, and the boundary it may not cross
- The `.kmod` bundle: what it contains, how it is versioned, how it declares compatibility
- Installation: from the Store, and by uploading a bundle by hand
- The Store: the GitHub-release registry, trust, and what is shown before installing
- Lifecycle: enable, disable, update, uninstall, and what happens to a module's data
- Failure: what a crashed or incompatible sidecar does to the rest of the server
- First-party modules as a set, and why each is a module rather than core

## Open questions

- What is the compatibility promise between a server version and an installed module?
- May a module ship UI, and if so what is it allowed to render?

## Must answer

- [ ] The trust model for third-party modules on a public registry
- [ ] What a user is told when a module they rely on stops being maintained

## Existing material

`modules/README.md`, `docs/module-registries.md`, `docs/modules-as-kmod.md`, and
`modules/module.schema.json` — this file states the product rules, those state the mechanics.
