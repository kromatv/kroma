---
name: rust-best-practices
description: Rust best practices. Use when reading or editing any .rs file, designing a crate's public API, choosing an error type, splitting a workspace, or writing async code on tokio. Triggers - "rust best practices", "is this idiomatic", "should this be a newtype", "anyhow or thiserror", "why does the borrow checker", "review this Rust".
---

# Rust best practices

One idea underneath every rule: a wrong program should not compile. Where a
project also writes TypeScript, the same table lives one language over in
**typescript-best-practices**. Rust hands you more of that for free, so the
failures move: `unwrap()`, a `clone()` that silences the borrow checker, a
stringly typed API, a blocking call on the async runtime.

| Rule | Summary |
|------|---------|
| Enums with data | Model variants as an `enum` carrying each variant's payload. A struct of `Option` fields plus a `bool` admits states that cannot happen. |
| Newtypes | Wrap primitives that mean something: `struct UserId(Uuid)`, `struct Seconds(u32)`. Two `String` parameters in a row swap silently; two newtypes do not. |
| Parse at the edge | Untrusted bytes become a typed value once, at the boundary, with serde plus validation. Inside, trust the type. Bound the body before parsing. |
| Errors by layer | A library returns its own `enum` error (`thiserror`), a binary composes with `anyhow`. Never `Box<dyn Error>` in a public signature you own. |
| No unwrap in library code | `?` propagates, `let ... else` returns early. `expect` only for an invariant, with a message naming what was violated. Tests and `main` may panic. |
| Context, not stringly errors | Add context as you propagate (`.context("reading manifest")`), keep the source chain. Formatting an error into a `String` early throws the cause away. |
| Borrow in, own out | Take `&str`, `&[T]`, `impl IntoIterator`. Return the owned type. A `clone()` added to end a borrow argument is a design smell; restructure the scope. |
| Deliberate visibility | `pub(crate)` by default. `pub` is an API promise. `#[non_exhaustive]` on a public enum or struct that will grow. |
| Conversions via traits | `From`/`TryFrom` rather than `to_thing()` helpers, so `?` and generic code pick them up. |
| Don't block the runtime | No file, SQLite, or CPU work on an async thread: `spawn_blocking`. Never hold a `std::sync::Mutex` guard across `.await`. |
| Cancellation safety | Anything inside `select!` may be dropped at any await point. Long work takes a cancellation token and honours it. |
| Iterators over index loops | Express the transformation. Avoid `collect()` into a `Vec` you immediately iterate. |
| SAFETY on unsafe | Every `unsafe` block carries a `// SAFETY:` comment stating the invariant that makes it sound. No exceptions. |
| Secrets never in Debug | A type holding a token, key or password gets a hand-written `Debug` that redacts. Derived `Debug` leaks into every log line. |
| Clippy is the floor | `cargo clippy --workspace --all-targets` clean, warnings denied in CI. A lint you disagree with is suppressed at the line, with the reason. |
| Real tests | Unit tests beside the code, integration tests in `tests/`. No `sleep` for synchronisation. Property tests where the invariant is stateable. |

Examples: `references/patterns.md`.

Read the project's `Cargo.toml` lints table and its clippy configuration before
deciding a rule here does not apply.
