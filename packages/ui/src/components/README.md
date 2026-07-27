# The component hierarchy

Six levels, built bottom-up. Each one is only allowed to know about the levels
below it, which is the whole reason the split earns its keep: you can read a
level without reading the app.

| Level | Where | What earns a place |
| --- | --- | --- |
| 1. Tokens | [`src/lib/tokens/`](../lib/tokens) | A raw value that cannot be decomposed: `#F4B642`, `16`, `Hanken Grotesk`. |
| 2. Atoms | [`atoms/`](./atoms) | One indivisible control. Break it down and it stops being useful. |
| 3. Molecules | [`molecules/`](./molecules) | A few atoms bonded into one arrangement the design names. |
| 4. Organisms | [`organisms/`](./organisms) | A whole region of a screen, usually owning behaviour. |
| 5. Templates | [`templates/`](./templates) | A page skeleton: where things go, with no data. |
| 6. Pages | **not here** | A template filled with real data — see below. |

## Pages are not in the kit

A page knows the server, the router and the session, so it belongs to an app, not
to a design system: `packages/tv/src/features/*` for the 10-foot screens,
`clients/*/src` for the browser and phone ones. A kit that shipped pages would be
shipping the product, and every screen would have to be re-approved by the design
system to change a string.

## A component is a folder

```
atoms/button/
  button.tsx                        the component, its variants, its props
  button.stories.tsx                what the workbench shows and can adjust
  button.detail-actions.demo.tsx    a worked example; the file IS the code sample
  index.ts                          re-export, so importers write './button'
```

Everything about one component sits together: change it and its story and its
examples are in the same folder, so there is nowhere for them to rot unnoticed.
The `index.ts` is what lets the level barrel keep saying `from './button'`.

## Getting them out

Three doors, in the order you should reach for them:

```tsx
import { Button, ListRow, Rail } from '@kroma/ui/kit';        // 1. the flat barrel
import { Button } from '@kroma/ui/kit/atoms/button';          // 2. one component
import { colors } from '#ui/lib/tokens';                      // 3. inside the kit only
```

1. **`@kroma/ui/kit`** re-exports all four component levels flat. App code should
   use this and never learn which level something is at — the levels are for the
   people editing the kit.
2. **`@kroma/ui/kit/<level>/<name>`** is one component without the rest of the
   kit's module graph, for a package that wants `Button` and nothing else
   (`packages/admin-kit`). It is a single wildcard in `package.json`, so no list
   is maintained: add a folder and it is importable.
3. **`#ui/*`** is the kit's own internal alias (package.json `imports`) so its
   files never climb `../../..`. It is NOT for consumers. Four resolvers have to
   be told about it separately, because none of them reads the others' config:
   `tsconfig.base.json`, `vitest.config.ts`, `clients/tv-build/rnw.ts` (every web
   target) and `clients/expo-build/metro-workspace.js` (Metro).

## Moving a component between levels

Move the folder, fix the two barrels, and that is all — the workbench follows on
its own, because it reads the level from the file's path rather than from a field
anything could get wrong. See `tierFor` in `@kroma/workbench`.
