# Conventions

House rules that aren't obvious from reading a single file. Short on purpose —
if a rule needs a page to justify, it belongs in a comment next to the code.

## Validate with zod, never by hand

Anything crossing a trust boundary — an HTTP body, a stored blob, a third-party
JSON file, a message from another process — is parsed by a zod schema. Not by
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

Schemas live in a `schemas.ts` (or `src/schemas/`) next to what they describe —
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
