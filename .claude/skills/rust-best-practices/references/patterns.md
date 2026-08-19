# Rust patterns

Code examples for the rules in `SKILL.md` that need one.

## Enums with data

```rust
// Don't. Four booleans of nonsense: ready with no stream, failed with no error.
struct Playback {
    ready: bool,
    stream: Option<Stream>,
    error: Option<PlaybackError>,
}

// Do. Three states, all of them real.
enum Playback {
    Idle,
    Ready(Stream),
    Failed(PlaybackError),
}
```

`match` on the enum and the payload comes with the arm. Adding a variant breaks
every `match` that forgot it, which is the whole point.

## Newtypes

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct UserId(Uuid);

#[derive(Debug, Clone, Copy)]
pub struct Seconds(pub u32);

pub fn seek(session: SessionId, to: Seconds) {}
```

Validate once, at construction, and let the type carry the proof:

```rust
impl TryFrom<&str> for UserId {
    type Error = ParseIdError;
    fn try_from(raw: &str) -> Result<Self, Self::Error> {
        Ok(Self(Uuid::parse_str(raw)?))
    }
}
```

## Parse at the edge

```rust
// Don't. Every reader re-checks, and one of them forgets.
fn handle(body: &str) -> Result<()> {
    let v: serde_json::Value = serde_json::from_str(body)?;
    let id = v["id"].as_str().ok_or_else(|| anyhow!("no id"))?;
    ...
}

// Do. One typed value at the boundary, trusted everywhere inside.
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Grab {
    id: ReleaseId,
    #[serde(default)]
    force: bool,
}

fn handle(body: Bytes) -> Result<(), GrabError> {
    if body.len() > MAX_BODY {
        return Err(GrabError::TooLarge);
    }
    let grab: Grab = serde_json::from_slice(&body)?;
    accept(grab)
}
```

`deny_unknown_fields` turns a renamed field into a loud failure instead of a
silently ignored one. Bound the body before parsing: a schema cannot reject bytes
it has not read yet.

## Errors by layer

```rust
// A library crate owns its failure vocabulary.
#[derive(Debug, thiserror::Error)]
pub enum ScanError {
    #[error("media root {0} is not readable")]
    UnreadableRoot(PathBuf),
    #[error("probe failed")]
    Probe(#[from] ffprobe::Error),
}

// A binary composes them.
fn main() -> anyhow::Result<()> {
    let library = scan(&config.roots).context("scanning media roots")?;
    Ok(())
}
```

`#[from]` gives `?` the conversion. The `#[error(...)]` string is the message a
user sees, so it names the thing that failed, not the function it failed in.

## No unwrap in library code

```rust
// Don't.
let entry = index.get(&id).unwrap();

// Do.
let Some(entry) = index.get(&id) else {
    return Err(ScanError::UnknownId(id));
};

// Fine, an invariant the code just established.
let first = parts.first().expect("split always yields one element");
```

## Context, not stringly errors

```rust
// Don't. The cause is now prose, and the source chain is gone.
let manifest = read(path).map_err(|e| format!("failed to read manifest: {e}"))?;

// Do. Each layer adds what it knows and the chain survives.
use anyhow::Context;

let manifest = read(path)
    .with_context(|| format!("reading manifest at {}", path.display()))?;
```

`{:#}` on the resulting error prints the whole chain. Formatting an error into a
`String` early throws away the one thing that would have located the bug.

## Deliberate visibility

```rust
// Don't. Everything is public, so everything is API you cannot change.
pub struct Supervisor {
    pub port: u16,
    pub children: Vec<Child>,
}

// Do. Public surface is a decision, and the enum can still grow.
pub struct Supervisor {
    port: u16,
    children: Vec<Child>,
}

impl Supervisor {
    pub fn port(&self) -> u16 {
        self.port
    }
}

#[non_exhaustive]
pub enum Event {
    Started,
    Stopped,
}
```

`pub(crate)` by default. `#[non_exhaustive]` means a new variant is not a breaking
change, because callers cannot write an exhaustive match against it.

## Conversions via traits

```rust
// Don't. `?` cannot see this, so every call site converts by hand.
impl ManifestError {
    fn to_api_error(&self) -> ApiError { ... }
}

// Do. `?` picks it up, and so does generic code.
impl From<ManifestError> for ApiError {
    fn from(err: ManifestError) -> Self {
        ApiError::BadManifest(err.to_string())
    }
}

impl TryFrom<&str> for ModuleId {
    type Error = IdError;

    fn try_from(raw: &str) -> Result<Self, Self::Error> {
        if raw.split('.').count() < 3 {
            return Err(IdError::NotReverseDns);
        }
        Ok(ModuleId(raw.to_owned()))
    }
}
```

## Borrow in, own out

```rust
// Don't. Forces every caller to allocate.
pub fn label(title: String, tags: Vec<String>) -> String {}

// Do.
pub fn label(title: &str, tags: &[String]) -> String {}
```

When the borrow checker refuses, the fix is usually a smaller scope or a split
function, not a `clone()`:

```rust
// Don't. The clone exists only to end the borrow.
let name = entry.name.clone();
index.insert(id, entry);

// Do. Read what you need, then move.
let name = &entry.name;
tracing::info!(%name, "indexing");
index.insert(id, entry);
```

## Don't block the runtime

```rust
// Don't. SQLite is blocking; this stalls every task on the thread.
let rows = conn.prepare("select ...")?.query_map([], row_to_title)?;

// Do.
let rows = tokio::task::spawn_blocking(move || {
    pool.get()?.prepare("select ...")?.query_map([], row_to_title)
})
.await??;
```

A `std::sync::MutexGuard` held across `.await` deadlocks the runtime the day two
tasks land on one thread. Either take the lock inside a non-async block, or use
`tokio::sync::Mutex` and mean it.

## Cancellation safety

```rust
tokio::select! {
    _ = token.cancelled() => return Ok(()),
    result = probe(&path) => result?,
}
```

Everything in the losing branch is dropped mid-flight. Anything that must not be
interrupted halfway (a write, a two-step state change) goes in a `spawn`ed task
that owns its own completion, not in a `select!` arm.

## Iterators over index loops

```rust
// Don't. Bounds, a mutable accumulator, and an index that can be wrong.
let mut names = Vec::new();
for i in 0..modules.len() {
    if modules[i].enabled {
        names.push(modules[i].id.clone());
    }
}

// Do. The transformation is the code.
let names: Vec<_> = modules
    .iter()
    .filter(|m| m.enabled)
    .map(|m| m.id.clone())
    .collect();

// Better, where the caller only iterates.
fn enabled_ids(modules: &[Module]) -> impl Iterator<Item = &ModuleId> {
    modules.iter().filter(|m| m.enabled).map(|m| &m.id)
}
```

Skip the `collect()` into a `Vec` you immediately iterate, and skip the `clone()`
when a borrow reaches as far as the caller needs.

## Secrets never in Debug

```rust
#[derive(Clone)]
pub struct ApiToken(String);

impl fmt::Debug for ApiToken {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("ApiToken(redacted)")
    }
}
```

A derived `Debug` reaches a log line the first time someone adds `?state` to a
tracing macro, and log lines outlive incidents.

## SAFETY on unsafe

```rust
// SAFETY: `buf` is `len` bytes long and was written by `read_exact` above, so
// every byte in the range is initialised.
let frame = unsafe { slice::from_raw_parts(buf.as_ptr(), len) };
```

The comment states the invariant a reader must check, not what the line does.

## Clippy is the floor

```toml
# Cargo.toml, at the workspace root
[workspace.lints.clippy]
all = { level = "deny", priority = -1 }
unwrap_used = "warn"
```

A lint you disagree with is suppressed at the line, with the reason, never crate-wide:

```rust
#[allow(clippy::too_many_arguments)] // the shape mirrors the ffmpeg CLI it builds
fn build_args(...) -> Vec<String> {
```

An `#[allow]` at the top of a file silences the lint for code nobody has written
yet.

## Real tests

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn refuses_a_manifest_with_no_entrypoint() {
        let raw = fixture("no-entrypoint.json");

        let err = Manifest::parse(&raw).unwrap_err();

        assert!(matches!(err, ManifestError::NoEntrypoint));
    }
}
```

Unit tests beside the code, integration tests in `tests/` against the public API
only. Never `sleep` to synchronise: wait on the channel, the notify or the join
handle. Reach for a property test where the invariant is stateable, such as a
round trip through parse and serialise.
