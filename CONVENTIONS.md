# Conventions

House rules that aren't obvious from reading a single file. Short on purpose.

For how the code itself is written (naming, structure, and when a comment is
allowed to exist), see [`CODE_STYLE.md`](CODE_STYLE.md).

## Validate with zod, never by hand

Anything crossing a trust boundary (an HTTP body, a stored blob, a third-party
JSON file, a message from another process) is parsed by a zod schema. Not by
`typeof` chains, not by `as` casts.

Do not write this:

```ts
if (typeof input !== 'object' || input === null)
  return { ok: false, reason: 'notification must be an object' };
const n = input as Record<string, unknown>;
const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);
const title = str(n.title);
if (!title) return { ok: false, reason: 'title is required' };
```

Write this:

```ts
const Notification = z.object({
  title: z.string().min(1).max(256),
  body: z.string().max(1024).default(''),
});

const result = Notification.safeParse(input);
if (!result.success) return error(400, firstIssue(result.error));
```

Why, beyond it being shorter:

- **`as Record<string, unknown>` is a lie the compiler stops checking.** Every
  field read after that cast is unverified, and the type system has been told to
  stop helping. A schema produces a value whose type is *earned*.
- **Hand-written guards drift from the type they claim to guard.** Add a field
  to the interface and the validator silently keeps accepting input without it.
  With `z.infer`, the type and the check are the same declaration.
- **Bounds get forgotten.** A hand-rolled check almost never caps length; a
  schema makes `.max()` the natural thing to write, which matters when the input
  is attacker-controlled.
- **The error messages come free**, and they name the field rather than echoing
  the payload back at the caller.

Schemas live in a `schemas.ts` (or `src/schemas/`) next to what they describe:
see `packages/client/src/schemas/` and `packages/push-relay/worker/schemas.ts`.

The one thing that stays hand-written is a **size check before parsing**: a
schema cannot reject bytes it has not read yet, so bound the body first, then
parse.

## Secrets belong where the source is not

The server's source is public and self-hosted by anyone, so a credential
committed to it is a credential published. Anything Apple or Google issued to
the published app lives in the relay Worker's secrets
(`packages/push-relay/`), never in the server, the app, or a settings form an
operator could fill in.

## A design value is never written raw

No hex literal, no `rgba()`, no hard-coded radius, no font size. Colour comes
from a token name (`bg="surface2"`, `color="textDim"`, `'accent/45'` for alpha),
shape from `radius`, type from a role. The point is not tidiness: a raw value is
invisible to the theme, so it survives a theme swap and a light palette as a
stain nobody sees until a user does.

The failure mode is specific and it has already happened: a value copied from the
design that is byte-for-byte identical to a token, plus near-misses that quietly
become a second palette (`#E8536A` beside `colors.danger`). If a value you need
is not a token, add the token.

## Never alpha an icon

Icons are drawn at solid opacity, and nothing translucent sits under an icon
badge. An icon is already a thin shape; alpha makes it read as disabled on an OLED
panel across a room, which is the one screen this product is designed for. To
quieten an icon, pick a dimmer colour token. Do not fade it.

## No module-scope mutable state

A `let` at module scope, or a `Map` outside a component that survives a remount,
is a global. It leaks between tests, between shells that share the module graph,
and between two mounts of the same screen. When something must outlive a remount,
hoist the component itself, which on TV means the router's chrome and backdrop
slots, rather than parking the state beside it.

Caches keyed on the theme version are the deliberate exception (`sv`, `styles()`),
and they are already written.

## A package is reached by name, never by path

`import { tvShellConfig } from '../../packages/bundler/src/shell'` is forbidden,
even when it resolves. Crossing a package boundary on a relative path defeats the
workspace graph: the dependency is invisible to `package.json`, to knip, and to
anyone reading the manifest to find out what this package needs. Write
`import { tvShellConfig } from '@kroma/bundler'`.

Shared code lives in a real `@kroma/*` workspace package, depended on by name. If
the code has no package, that is the work: give it one.

## No em dashes

Not in comments, not in user-facing copy, not in documentation. Use a comma, a
colon, or a full stop. This one is purely house preference, and it is written down
only because it is otherwise invisible until review.
