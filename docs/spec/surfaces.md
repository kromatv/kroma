# Surfaces

Status: **DRAFT** — skeleton only, nothing here is agreed yet.

KROMA runs on a television, a phone, a browser, a desktop and a NAS. This file says what
every surface must do, what each may do differently, and what a surface is explicitly
allowed *not* to do — so a missing feature is a decision on record rather than a gap.

## The surfaces

| Surface | Shell | Notes |
|---|---|---|
| Web | `clients/web` | The reference implementation |
| TV — Samsung | `clients/tizen` | 10-foot UI, remote-only input |
| TV — LG | `clients/webos` | 10-foot UI, remote-only input |
| TV — other | `clients/tv-web`, `clients/tv-native` | |
| Mobile | `clients/mobile` | Offline downloads |
| Desktop | `clients/desktop` | Auto-update |
| NAS | `clients/synology` | Packaging, not a client |

## Scope

- The baseline every surface must provide to be called KROMA
- Per-surface capability matrix, including direct-play capability by device generation
- Input models: remote, touch, pointer — and what changes in the UI because of each
- Offline: which surfaces support it and what it means on each
- Packaging and update mechanism per surface
- Deprecation: when a surface stops being supported, and what its users are told

## Must answer

- [ ] The baseline feature set, stated once, so "not on TV yet" is measurable
- [ ] Which surfaces are first-class and which are best-effort

## Not in scope

The shared component kit is architecture — see `packages/ui/src/components/README.md`.
