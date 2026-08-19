# TypeScript patterns

Code examples for the rules in `SKILL.md` that need one. The principles are language-agnostic: the same table exists for Rust in the **rust-best-practices** skill.

## Branded types

Brand primitives so they can't be mixed up. Validate once at creation; downstream code trusts the type.

```ts
type AgentId = string & { readonly __brand: "AgentId" };

function parseAgentId(input: string): AgentId {
  if (!isUUID(input)) throw new Error(`Invalid agent id: ${input}`);
  return input as AgentId;
}

function focusAgent(id: AgentId): void {
  /* input is trusted */
}
```

Match the `readonly __brand: 'X'` shape; don't invent a new convention.

## Discriminated unions

If a bug forces the question "wait, can this combination actually happen?", the type is too loose. Model variants with a literal discriminant: every variant shares the field name and each variant's value is unique, so impossible combos can't be represented.

```ts
// Don't. Boolean + optionals lets contradictory states exist.
type DiffState = { loading: boolean; diff?: GitDiff; error?: string };

// Do. Only valid states exist.
type DiffState =
  | { kind: "loading" }
  | { kind: "ready"; diff: GitDiff }
  | { kind: "error"; error: string };
```

Pick one discriminant name (`kind`, `type`, `tag`) and stick to it.

## Constructive modeling

Build the type from parts that are all legal instead of restricting a loose type with runtime checks. Adding is easier than subtracting.

Non-empty, via a variadic tuple:

```ts
type NonEmpty<T> = [T, ...T[]];

// Don't: T[] plus a length check every caller must repeat
function pickWinner(entries: string[]): string {
  if (entries.length === 0) throw new Error("no entries");
  return entries[Math.floor(Math.random() * entries.length)];
}

// Do: an empty value of the type can't exist
function pickWinner(entries: NonEmpty<string>): string {
  return entries[Math.floor(Math.random() * entries.length)];
}
```

Where a plain `T[]` arrives, narrow once with a guard. The fact then travels in the type:

```ts
const isNonEmpty = <T>(arr: T[]): arr is NonEmpty<T> => arr.length > 0;
```

Even length, as pairs. TypeScript has no refinement types (no `arr.length % 2 === 0` at the type level); you don't need one:

```ts
type Pairs<T> = [T, T][];
```

A time range, as start plus duration:

```ts
// Don't: a comment holds the invariant
type TimeRange = { start: Date; end: Date }; // start <= end

// Do: a negative range can't be written; derive end when needed
type TimeRange = { start: Date; durationMs: number };
```

Keep `durationMs` a plain number. Brand it (per Branded types) only if a raw number could be passed where a duration is expected, not by reflex. A `Pairs<T>` is an even-length list under the interpretation you give it, the same way `{ start, durationMs }` is a range. Pick the representation that makes the bad state unconstructable, then expose the reading you need on top (`pairs.flat()`, a `rangeEnd()` helper).

## Simplest total type

Don't strengthen everything. Keep `T[]` when every operation on it is total:

```ts
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0); // [] is 0, fine
```

Strengthen when the loose type forces a lie at a use site. The tells are `!`, `arr[0] as T`, and a "should never happen" throw:

```ts
// Don't: partiality smuggled past the compiler
function newestSession(sessions: Session[]): Session {
  return sessions.at(0)!;
}

// Do: strengthen the input; the assertion disappears
function newestSession(sessions: NonEmpty<Session>): Session {
  return sessions[0];
}
```

Weakening the result to `Session | undefined` is the other total signature. Either way the empty case lands at the call site, the one place that knows what empty means.

## `unknown` over `any`

`any` disables type checking for everything it touches. External data is always `unknown`. Narrow before use.

```ts
// Don't
function handle(input: any) {
  return input.foo.bar;
}

// Do
function handle(input: unknown) {
  if (typeof input === "object" && input !== null && "foo" in input) {
    // narrowed; compiler verifies access
  }
}
```

External sources include RPC payloads, `JSON.parse`, `postMessage`, IPC, file contents, environment variables, database results.

## No `as` casts

Every `as` is a potential runtime crash. Cast only after the type system has verified the claim.

```ts
// Don't
const user = data as User;

// Do. Earn the cast at the boundary.
function parseUser(data: unknown): User {
  if (typeof data !== "object" || data === null) {
    throw new Error("expected object");
  }
  if (!("id" in data) || typeof (data as Record<string, unknown>).id !== "string") {
    throw new Error("expected id");
  }
  // ... validate all fields
  return data as User; // OK, earned cast after full validation
}
```

When refactoring an `as` out of existing code, identify why TypeScript can't infer:

- Missing discriminant: add one, switch to a discriminated union.
- Overly wide source type (e.g. `Record<string, unknown>`): narrow it.
- Untyped boundary: add a parse function or schema.
- Genuinely inexpressible: use a branded type or `satisfies`.

## Narrowing hierarchy

From best to last-resort:

1. **Discriminated union switch / if.** Compiler narrows automatically.
2. **`in` operator.** `"key" in obj` narrows to variants containing that key.
3. **`typeof` / `instanceof`.** For primitives and class instances.
4. **User-defined type guard.** When the above aren't enough.
5. **`as` cast.** Only after validation.

```ts
function area(s: Shape): number {
  if ("radius" in s) return Math.PI * s.radius ** 2; // narrowed to circle
  return s.width * s.height; // narrowed to rect
}
```

## Type guards

A guard must actually verify the claim. A lying guard is worse than `as` because the bug hides behind a name that says it's safe.

```ts
function isCircle(s: Shape): s is Shape & { kind: "circle" } {
  return s.kind === "circle";
}
```

Prefer discriminant narrowing when possible. The guard adds a layer the reader has to follow.

## Exhaustiveness

In default arms, assign the discriminant to a `never`-typed local. The compiler errors if a new variant is added without handling.

```ts
// Value-returning switch
function area(s: Shape): number {
  switch (s.kind) {
    case "circle":
      return Math.PI * s.radius ** 2;
    case "rect":
      return s.width * s.height;
    default: {
      const _exhaustive: never = s;
      return _exhaustive;
    }
  }
}

// Void switch
function handle(s: Shape): void {
  switch (s.kind) {
    case "circle":
      drawCircle(s);
      break;
    case "rect":
      drawRect(s);
      break;
    default: {
      const _exhaustive: never = s;
      void _exhaustive;
    }
  }
}
```

Return-style in value-returning switches; void-style in statement switches.

## `satisfies` over `as`

`satisfies` validates without widening literal types.

```ts
// Don't. Widens, loses literal types.
const config = { theme: "dark", cols: 3 } as Config;

// Do. Validates AND preserves literal types.
const config = { theme: "dark", cols: 3 } satisfies Config;
// config.theme is "dark" (literal), not string
```

## Boundary validation

Validate once where data crosses in; trust types inside. See the **boundary-discipline** principle skill.

- **Wire formats** (proto, JSON-RPC): parse with `ignoreUnknownFields` so forward-compatible changes don't break old clients.
- **Persisted JSON:** versioned blob with a try/catch around the parse.
- **Don't re-validate** deep in call chains.

## Schema-derived types

When a `.proto`, OpenAPI spec, GraphQL schema, or database migration already defines a shape, derive from the generated types instead of duplicating them.

```ts
// Don't. Duplicate shape, drifts when the schema changes.
type CheckSummary = {
  totalCount: number;
  checks: { name: string; status: string }[];
};
function renderChecks(s: CheckSummary) {
  /* ... */
}

// Do. Derive from the generated schema type.
import type { ChecksMessage } from "<generated module>";
function renderChecks(s: Pick<ChecksMessage, "totalCount" | "checks">) {
  /* ... */
}
```

Reach for `Pick`, `Omit`, `Parameters`, `ReturnType`, `Awaited`, `typeof` before writing a new interface.

## Object args

```ts
// Don't. Swap two args, still compiles.
openFile(uri, {
  startLineNumber: 10,
  startColumn: 1,
  endLineNumber: 10,
  endColumn: 1,
});

// Do. Order-independent, self-documenting.
openFile({
  uri,
  selection: {
    startLineNumber: 10,
    startColumn: 1,
    endLineNumber: 10,
    endColumn: 1,
  },
});
```

Skip on hot paths: per-frame render, tokenizers, parsers, anything in a tight loop where the allocation cost matters.

## Real tests

```ts
// Don't. Every assertion is about the mock, so the suite passes with the real
// client broken.
const client = { fetch: vi.fn().mockResolvedValue({ ok: true }) };
await sync(client);
expect(client.fetch).toHaveBeenCalledTimes(1);

// Do. Run the real thing against a real boundary and assert what came out.
it('retries once and gives up on a second failure', async () => {
  const server = await startTestServer({ failTimes: 2 });

  const result = await sync(createClient(server.url));

  expect(result).toEqual({ ok: false, code: 'unreachable' });
  expect(server.hits).toBe(2);
});
```

Mock only what you cannot run locally: a payment provider, an app-store receipt, a
push endpoint. A fake for something the test could have started is a test of the
fake.

## Structured telemetry

```ts
// Don't. Unsearchable, unparseable, and it ships.
console.log('failed to import ' + release.title);

// Do. One event, enough context to debug from an id alone.
log.warn('import.failed', {
  releaseId: release.id,
  reason: 'no-matching-file',
  candidates: candidates.length,
});
```

Log the id, not the whole object: a payload dumped into a log line is how a secret
or a user's path ends up in a retained index.

## Strict by default

```jsonc
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "skipLibCheck": true
  }
}
```

`noUncheckedIndexedAccess` is the one people switch off and the one that finds
real bugs: `items[0]` is `T | undefined` because the array may be empty.
`exactOptionalPropertyTypes` fights older React typings, so turn it on for a new
package rather than mid-migration.

## Errors as values

```ts
type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };
type FetchError = "offline" | "not-found" | "forbidden";

async function loadTitle(id: TitleId): Promise<Result<Title, FetchError>> {
  const response = await fetch(`/api/titles/${id}`);
  if (response.status === 404) return { ok: false, error: "not-found" };
  if (response.status === 403) return { ok: false, error: "forbidden" };
  return { ok: true, value: Title.parse(await response.json()) };
}
```

A 404 is data and it returns. A violated invariant is a bug and it throws. In a
`catch`, the value is `unknown` until narrowed, and a `catch` that neither
rethrows nor handles turns a failure into a mystery three screens later.

## No floating promises

```ts
// Don't. The rejection is lost and the caller returns before the write lands.
void savePosition(id, seconds);

// Do. Independent work runs together and every failure has an owner.
const [title, progress] = await Promise.all([loadTitle(id), loadProgress(id)]);
```

Turn the lint rule on rather than trusting review to catch it. Anything long
running takes an `AbortSignal` and honours it; a constructor cannot be async, so
use a static factory.

## Named exports

```ts
// Don't. Every import site invents its own name for this.
export default function player() {}

// Do.
export function createPlayer(options: PlayerOptions): Player {}
import type { PlayerOptions } from "./types";
```

An `index.ts` re-exporting a package's internals defeats tree shaking, slows the
compiler and invites cycles. Export the public surface on purpose. A cycle
between modules is a design error, not a bundler setting.
