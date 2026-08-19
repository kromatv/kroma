---
name: typescript-best-practices
description: TypeScript best practices. Use when reading or editing any .ts or .tsx file, designing a module's public types, fixing a type error, choosing between type and interface, or setting up tsconfig, and whenever a diff reaches for any, as, ! or @ts-ignore. Triggers - "typescript best practices", "is this type safe", "how should I type this", "review this TS", "any vs unknown".
---

# TypeScript best practices

One idea underneath every rule: a wrong program should not compile. Every `any`, `as`, `!` and `@ts-ignore` is a place where you took that back.

| Rule | Summary |
|------|---------|
| Discriminated unions | Model variants with a `kind` literal discriminant so impossible states can't be represented. No optional-field bags. |
| Branded types | Brand primitives with `& { readonly __brand: "X" }` so they can't be mixed up. Validate once at creation. |
| Constructive modeling | Build the shape so the illegal value can't be constructed. `[T, ...T[]]` for non-empty, `[T, T][]` for even length, `start` plus `duration` for a range. Not a runtime guard, not a wish for refinement types. |
| Simplest total type | Keep `T[]` while every operation on it stays total. Strengthen to `NonEmpty<T>` only where the loose type forces `!`, a cast, or a "should never happen" throw. |
| `unknown` over `any` | External data is `unknown`. `any` disables type checking everywhere it touches. |
| No `as` casts | Every `as` is a runtime crash waiting. Cast only after validation. |
| Narrowing hierarchy | Discriminant switch > `in` operator > `typeof`/`instanceof` > user-defined type guard > `as`. |
| Type guards | Must verify the claim. A lying guard is worse than `as` because the bug hides behind a name that says it's safe. Name them `isX` or `hasX`. |
| Exhaustiveness | Inline `const _exhaustive: never = x;` in default arms so the compiler errors when a new variant is added. |
| `satisfies` over `as` | Validates the value without widening literal types. |
| Boundary validation | Validate where data crosses in, trust the types inside. A schema at every trust boundary, never a `typeof` chain behind an `as` cast. |
| Schema-derived types | Reach for `Pick`/`Omit`/`Parameters`/`ReturnType`/`Awaited`/`typeof` before declaring a new interface. |
| Object args | Pass objects, not positional, so argument order is self-documenting. Skip on hot paths (per-frame render, tokenizers, parsers). |
| Real tests | Don't mock what you can run. Prefer the framework's real test primitives with leak/disposable checks, and verify UI in a running build. Mock only what you can't run locally. |
| Structured telemetry | Prefer structured logger diagnostics with enough context to debug from an id. No `console.log` in shipped code. |
| Strict by default | `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, `isolatedModules`. Below that floor the rest of this table is decoration. A project missing one raises it rather than working around it. |
| Errors as values | Expected failure returns a `Result` with a union of literal codes. Throw only for a violated invariant. `catch (error: unknown)`, never a silent `catch {}`. |
| No floating promises | Every promise is awaited, returned, or handed to an owner. Independent work runs under one `Promise.all`. Long work takes an `AbortSignal`. |
| Named exports | A default export renames itself at every call site. `import type` for types, no barrel over a package's internals. |

Examples: `references/patterns.md`, which covers the rules that need one.

Read the project's `tsconfig` and lint config before deciding a rule here does not
apply. Where a project also writes Rust, the same table lives one language over in
**rust-best-practices**.
