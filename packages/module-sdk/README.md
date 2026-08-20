# @kroma/module-sdk

The frontend module contract: the `KromaModule` manifest, the host context, the
typed event bus, and the dependency-ordered registry every `@kroma/module-*`
package targets. It mirrors the Rust `kroma-module-sdk`, so a module's two halves
describe themselves the same way.

For what a module IS and how to author one, see
[`modules/README.md`](../../modules/README.md) and
[`docs/modules-as-kmod.md`](../../docs/modules-as-kmod.md). This document covers
only what a module's FRONTEND may reach for.

## `src/admin/` is shared page furniture, not a design system

`context`, `hooks`, `settings`, `engines`, `page-states` and `denied` are the
pieces every module admin page needs to look like part of the same
product: the host handle, the settings form, the empty and error states, the
permission wall.

A component here earns its place by being needed by more than one module. One
module's own screen stays in that module's `ui/`. An arrangement that would also
serve the TV, the phone or the web client belongs in
[`@kroma/ui`](../ui/README.md) instead, at whichever level
[`components/README.md`](../ui/src/components/README.md) says it earns.

## Which import door

The public ones:

```tsx
import { Box, Field, PageHeader } from '@kroma/ui/kit';
import { Button } from '@kroma/ui/kit/atoms/button';
```

`#ui/*` is the kit's own internal alias and is not for consumers. The two
public doors emit identical bytes (measured: same raw size, gzip within 0.3%), so
reaching past them buys nothing and couples a module to the kit's file layout.

The same applies to a module's own `ui/`: a module is a separate cargo workspace
and a separate frontend, and it consumes the kit exactly as an app does.

## Styling

The kit's vocabulary, and no Tailwind. A module's admin pages are bundled into
the web client's build, so they inherit whatever that shell provides, but they
must not depend on it: a raw hex or a utility class is invisible to the theme and
survives a palette swap as a stain. Colours, radii and type come from token names.
See `CONVENTIONS.md`.

Every user-visible string is a translation key, resolved against the module's own
`locales/{en,fr}.json` first. That is a hard rule rather than a preference: a module
ships to operators who did not write it.
