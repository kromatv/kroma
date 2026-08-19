---
name: rust-tests
description: 'Write cargo tests. A test name is a sentence, the body is setup, mock, test and verify blocks separated by blank lines with no comments, and shared setup lives in a named test-support module rather than in each test. Covers naming, the block shape, where a test file goes, async and time, workspaces, and running one crate or one filter. Use when adding or changing any #[test] or #[tokio::test], or when Rust coverage has to come up. Triggers - "write a rust test", "cargo test", "test this crate", "cover this handler".'
---

# Rust tests

Same three rules as the TypeScript side: **the name is the sentence**, **the body
is blocks separated by blank lines**, and **there are no comments**. The
differences are where a test lives and what setup it is allowed to do.

```rust
#[test]
fn refuses_to_scan_without_credentials() {
    let state = test_state();
    let progress = Progress::default();

    let err = scan(&state, &progress.record(), &never_cancelled()).unwrap_err();

    assert!(matches!(err, ScanError::NoApiKey));
    assert_eq!(progress.seen(), vec![]);
}
```

## The four blocks

A body is up to four blocks, always in this order, one blank line between them:

| Block | Holds |
|-------|-------|
| **setup** | Fixtures, state, the world the behaviour needs |
| **mock** | Fakes and the responses they are primed with |
| **test** | The one call under test |
| **verify** | The assertions |

- **A blank line only ever separates two blocks.** Never one inside a block,
  never two in a row.
- **An empty block is absent, not blank.** Most tests have three, because a
  test-support helper builds the world and there is nothing left to fake.
- **No comment names a block.** The order is the label.
- **Every assertion in verify.** An `assert!` in the setup block is a
  precondition, and one worth checking is its own test.
- `let` bindings that only feed the call belong in setup, not squeezed into the
  test line. One statement under test, readable on its own.

Rust makes the mock block rarer than TypeScript does: a trait with a small fake
implementation is setup, not mocking, and it lives above the tests with a name.

## Naming

The function name is the sentence, in the present tense, describing behaviour:

```rust
fn refuses_to_scan_without_credentials()   // good
fn marks_a_missing_file_absent()           // good

fn test_scan()                             // names the function under test
fn scan_works()                            // says nothing
fn test_scan_returns_err_when_key_is_none() // describes the code, not the rule
```

Drop the `test_` prefix. `#[test]` already says it.

## Size and setup

One situation, one action, one assertion. Shared setup belongs in a named
test-support module, not repeated in each test. Find the one the crate already
has before writing a second: `test_support`, `common`, `tests/common/mod.rs` and
`fixtures` are all conventional names, and a crate usually has exactly one.

```rust
use crate::test_support::{seed_fixture, test_state};
```

When a test needs a fake collaborator, give it a name and keep it above the
tests, not inline:

```rust
#[derive(Default)]
struct Progress(RefCell<Vec<(usize, usize)>>);
```

A test that runs long is two tests, or a fixture that wants a name, or a function
that needs too many collaborators to say anything.

## No comments

No banner, no note above a case, no paragraph explaining what the module pins.
The name carries the behaviour and the blank lines carry the phases. A comment
survives only for a genuinely non-obvious fixture value, stating why that value
and not another.

`// SAFETY:` still applies inside `unsafe`, in tests as everywhere else.

## Assert behaviour

- `assert!(matches!(err, ScanError::NoApiKey))` beats asserting on a formatted
  string: the message is prose and prose changes.
- Assert the observable result, not the number of times a collaborator was
  called, unless the count is the behaviour.
- `unwrap()` and `expect()` are fine in a test. A panic is a failure and that is
  the point.
- Never weaken an assertion to make a suite green.

## Where it goes

- **Unit tests** live beside the code in a `#[cfg(test)] mod tests`, with access
  to the module's private items. This is where most tests belong.
- **Integration tests** live in the crate's `tests/` directory and see only the
  public API, which is what makes them worth having: a test that cannot reach a
  private helper proves the public surface is usable.
- Some projects keep API integration tests beside the handlers behind a file-name
  prefix instead, so the test moves with the route it covers. Follow the tree.
- **A workspace member is tested by name.** In a repo whose members are separate
  workspaces rather than one, `--workspace` from the root does not reach them, so
  check whether the project ships a script that iterates them.

## Async and time

- `#[tokio::test]` for anything awaiting. Keep the runtime default unless the
  test needs otherwise.
- Never `sleep` to synchronise. Wait on the thing itself: a channel, a notify, a
  join handle. A sleep is a flake with a timer on it.
- Pass time in rather than reading the clock, so the test does not depend on when
  it runs.

## Running one

```bash
cargo test -p <crate>              # one crate
cargo test --workspace <filter>    # one test name, everywhere
cargo test -p <crate> -- --nocapture
```

Run from the workspace root that owns the crate. Where the repo holds more than
one workspace, `cd` to the right one first.

## Before the PR

```bash
cargo clippy --workspace --all-targets && cargo test --workspace
```

Then whatever the project's manifest scripts run for members outside that
workspace, because `--workspace` does not reach them.

Where the file goes on disk, and what its suffix means, belong to the **naming**
skill.
