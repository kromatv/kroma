# The component hierarchy

Six levels, built bottom-up. Each one is only allowed to know about the levels
below it, which is the whole reason the split earns its keep: you can read a
level without reading the app.

| Level | Where | What earns a place |
| --- | --- | --- |
| 1. Tokens | [`src/core/tokens/`](../core/tokens) | A raw value that cannot be decomposed: `#F4B642`, `16`, `Hanken Grotesk`. |
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

## Composed, not configured

The kit's components follow **Radix's shape**: a component that is a *set of
parts* exposes them by name and lets the caller arrange them, rather than
growing a prop for every arrangement anyone might want.

```tsx
// Configured: every new demand is another prop, and the component becomes a
// switchboard nobody can read.
<ChoiceList items={items} renderBadge={...} hintPosition="below" showIcons />

// Composed: the caller writes the row, the component owns the behaviour.
<ChoiceList.Root label="Bibliotheques" value={picked} onValueChange={setPicked}>
  <ChoiceList.Item value={lib.value} label={lib.label}>
    <ChoiceList.Label>{lib.label}</ChoiceList.Label>
    <ChoiceList.Hint>128 titres</ChoiceList.Hint>
  </ChoiceList.Item>
</ChoiceList.Root>
```

What the Root owns and the parts read through context:

- **State.** Controlled by default (`value` + `onValueChange`), uncontrolled
  through `defaultValue` where it makes sense. The parts never hold their own
  copy of it.
- **Semantics.** The Root draws the group role (`radiogroup`), the parts carry
  their own (`radio`, `checkbox`) with the state that goes with them. A caller
  cannot arrange the parts into something that lies to a screen reader.
- **Behaviour.** Keyboard, focus, press. See `<Select>`, `<Menu>` and
  `<Dialog>`, which each present differently under a D-pad and under a pointer
  while the caller writes the same thing.

Two rules that are ours rather than Radix's, because Radix targets the browser
only and this kit does not:

1. **The whole row is the control**, not a small box at its edge: a television
   has one D-pad stop per row, and a pointer gets a hit area the size of the
   thing it is aiming at. So an indicator is a FACE (`<CheckboxFace>`,
   `<SwitchFace>`) with nothing pressable about it, and the row carries the
   semantics.
2. **Keep the sugar.** A part-based API must not make the common case verbose:
   `<ChoiceList.Item label hint />` renders the ordinary row, and the named
   parts are there for the ones it cannot describe. A design system whose
   simplest list takes twelve lines will be worked around.

3. **A container DECLARES to its parts; it cannot read them.** Radix's web
   components let CSS do the reading: `:first-child` flattens a corner,
   `has-[>textarea]` reshapes a shell, `order-last` moves an addon without
   moving the markup. None of that exists here, and Yoga has no `order` at all.
   So a Root that needs to know its own contents walks its children ONCE,
   sorts them, and publishes what it learned through context: a position
   (`first`/`middle`/`last`), a padding the entry must draw for itself, the
   layout the shell takes. `<InputGroup>` and `<ButtonGroup>` are both this.
   The corollary is real API: a part must be a DIRECT child to be sorted, and
   only a part that reads the context takes part in the shape.

Sugar is a shorthand for the parts, never a second implementation of them.

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
import { colors } from '#ui/core/tokens';                      // 3. inside the kit only
```

1. **`@kroma/ui/kit`** re-exports all four component levels flat. App code should
   use this and never learn which level something is at — the levels are for the
   people editing the kit.
2. **`@kroma/ui/kit/<level>/<name>`** is one component without the rest of the
   kit's module graph, for a package that wants `Button` and nothing else.
   It is a single wildcard in `package.json`, so no list
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
