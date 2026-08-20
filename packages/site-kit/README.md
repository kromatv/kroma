# @kroma/site-kit

The spine the KROMA site apps share: the document shell and its head, the header
and footer chrome, and the Cloudflare worker environment lookup.

Consumed by `apps/modules` (the module registry) and `apps/packages` (the release
listing). `apps/www` is a separate design and does not use it.

## What belongs here

Chrome that every site app draws the same way, and nothing else. A site's own
pages, its routes, its data loading and its copy stay in the app.

This package is not a second design system. If an arrangement here would be
useful to the TV, the phone or the web client, it belongs in
[`@kroma/ui`](../ui/README.md) instead, at the level
[`components/README.md`](../ui/src/components/README.md) says it earns.

## Which import door

The public ones, the same as any other consumer:

```tsx
import { Box, Button, Text } from '@kroma/ui/kit';        // the flat barrel
import { Button } from '@kroma/ui/kit/atoms/button';      // one component
```

`#ui/*` is the kit's own internal alias and is not for consumers, even though
four resolvers are configured to understand it. The two public doors emit
identical bytes (measured: same raw size, gzip within 0.3%), so reaching past
them buys nothing and couples this package to the kit's internal file layout.

## Styling

The kit's vocabulary, and no Tailwind. This package has no stylesheet of its own:
a consuming app imports `@kroma/ui/css` and the tokens arrive as custom
properties. Colours, radii and type come from token names
(`bg="surface1"`, `color="textDim"`, `variant="h1"`), never from raw values.
`CONVENTIONS.md` has the rule and the reason.

`apps/www` does use Tailwind. It shares no code with this package, and that is
why it can.
