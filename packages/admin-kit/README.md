# @kroma/admin-kit

The contract admin pages render with — built-in ones and the pages contributed by
installed modules. A module page imports from here (through
[`@kroma/module-sdk`](../module-sdk)) and never from app internals, which is what
lets a module ship UI without being rebuilt against the host.

## What belongs here, and what belongs to the design system

There is **one** design system: [`@kroma/ui`](../ui). Anything that exists in both
places is a bug, and the answer to "where does this component live" is almost
always *the kit*.

Two things genuinely belong here instead:

**Browser-idiom primitives.** `Image` and `Skeleton` take a `className` and are
sized with Tailwind utilities (`aspect-2/3`, `h-9 w-9 rounded-lg`). That is the
idiom of the admin pages that render them, and it is not something a React Native
component can express — there is no `className` in the kit, by construction. The
kit's `Img` and `Skeleton` are the same ideas for a screen laid out in numbers
against the 1920 stage. Both exist because the two apps are written in two
different styling languages, not because nobody has tidied up.

What must NOT diverge is the design. The loading wash is a token
(`colors.wash` → `--kroma-wash` → the `bg-wash` utility), so the kit's skeleton
and this one pulse the same colour by construction rather than by coincidence.

**Admin layouts.** `CardSkeleton` and `TableSkeleton` are shaped like the admin
tables they stand in for. They are compositions of an admin page, not primitives,
and the kit would have no use for them.

`EmptyState` used to be here and is not any more: it was a straight duplicate of
the kit's, so the copy is gone and the pages import
`EmptyState` from `@kroma/ui/kit`. Its `icon` is now a name (`icon="mood-empty"`)
rather than an element, because the kit resolves any [Tabler](https://tabler.io/icons)
glyph by name.

## The rest of it

- `context.tsx` — the host context a module page reads (server url, session, i18n).
- `controls.tsx`, `forms.tsx`, `settings.tsx` — the admin form dialect.
- `engines.tsx`, `header.tsx`, `primitives.tsx` — page furniture.
- `hooks.tsx`, `format.ts` — the small shared behaviours and formatters.

Adding something here is a decision to keep it out of the design system, so it
needs one of the two reasons above. If it has neither, it belongs in
[`@kroma/ui`](../ui).
