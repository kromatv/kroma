# Performance

The server measures where its own time goes, all the time, and keeps what it
measured. **Admin → Performance** shows it, and
`GET /api/admin/performance/export` hands it over as a file. The crate is
[`kroma-perf`](../server/crates/kroma-perf): it names nothing of KROMA, and no
module links it.

## What is measured

A **scope** is one request or one job run. A **segment** is one timed piece of
work inside a scope. Every segment counts in the scope that was current when it
ran, so a slow route says what it spent its time on.

| Kind | What it is | Origin | Where it comes from |
| --- | --- | --- | --- |
| `sql` | one SQLite statement, with its rows and SQLite's own count of full-scan steps, sorts and automatic indexes | the database: `core`, or the module that owns it | every connection the process opens, through an SQLite auto-extension installed at boot |
| `span` | one call of a function marked `#[tracing::instrument]` in a `kroma*` crate | `file:line` | `kroma_perf::span_layer`, with a filter of its own: these spans reach no log |
| `http` | one outbound call (TMDB, a registry, a relay) | the host | the egress sink every `kroma_http::Fetch` call already reports to |
| `point` | one call the core makes to a module through a point, named `<point>/<method>` (`embedder/embed`) | the module answering | `Point`, around each call it sends over the wire |

A statement is named by the text it was prepared from, as one line, with every
list of placeholders collapsed to `?…`. No parameter value is ever recorded. Its
time runs from its first step to its reset, so it includes the rows being read
out.

The kinds overlap (a span holds the SQL it ran), so they are never summed. A
request's `Server-Timing` header carries one entry per kind, the route it
matched (`scope;desc=`), and its total, so the browser's network panel shows
them.

## History

- The last hour in five-minute buckets, in memory.
- Hours for two days, then days for a month, in `<data>/perf.db`, per build, so
  a regression shows against the version that brought it. The file is
  measurements only: a schema change empties it.
- Every request slower than 250 ms, or running one segment 20 times or more,
  with its whole timeline (the first 400 segments), for a week.

## Signals

A row carries a flag when its numbers alone show a problem. The page, the export
and the CI test use the same names.

| Flag | When |
| --- | --- |
| `n_plus_one` | one call runs the same segment 20 times or more |
| `slow_p95` | 95th percentile over 500 ms for a request, 100 ms for SQL, 250 ms for anything else |
| `cold_outlier` | the slowest call is over a second and ten times the median |
| `large_response` | over 1 MiB per call |
| `server_errors` | answered 5xx at least once; for a job, a failed run |
| `full_scan` | over 1000 full-scan steps per call |
| `auto_index` | SQLite built a temporary index |
| `temp_sort` | sorted in a temporary b-tree on a statement taking over a millisecond |

The drawer of a core statement shows its `EXPLAIN QUERY PLAN`, run on a
read-only connection.

## The export

**Export for analysis** on the page downloads the period it shows. An admin
token reaches the same file:

```bash
curl -H "Authorization: Bearer $TOKEN" \
  "https://kroma.example/api/admin/performance/export?window=24h" -o perf.jsonl
```

The JSON Lines file opens with a `meta` record that names its source, units,
record types, flags and hints. Every other line is one self-contained record:
`request`, `job`, `segment` or `slowRequest`. A request carries the segments one
call of it runs, per call, so it reads without a join.

```bash
jq -s 'map(select(.type == "request")) | sort_by(-.p95Ms) | .[:10] | map({name, p95Ms, flags})' perf.jsonl
jq -c 'select(.type == "segment" and (.flags | index("full_scan")))' perf.jsonl
```

A span's origin is the `file:line` of the function. A statement has none: search
the repository for a distinctive fragment of its label.

## Putting your code in the reports

A function in a `kroma*` crate:

```rust
#[tracing::instrument(level = "trace", skip_all)]
fn build_board(...) { ... }
```

Work timed some other way, such as a call another crate reports when it ends:

```rust
kroma_perf::record(kroma_perf::Measured {
    kind: "fs",
    label: "walk images",
    origin: None,
    elapsed: started.elapsed(),
});
```

A background job is its own scope when its body runs inside
`kroma_perf::job(name, || ...)`, as every job of the engine's runner does.

Work sent to another thread stays in its request when it is carried:
`tokio::task::spawn_blocking(kroma_perf::carry(move || ...))`. The server's
`blocking`, `query` and `service` helpers already do it. Work that is not
carried still counts, under `(unattributed)`.

Never instrument a crate a module links (`kroma-db`, `kroma-sqlite`,
`kroma-http`, `kroma-module-*`, `kroma-primitives`): it moves every module's
bundle. Put the span on the engine or server function that calls it.

## The CI test

`server/src/api/it_statement_budget.rs` runs the routes a client opens most
against the demo library, then against it with 40 more episodes and 40 more
films. A route whose statement count grows by one for every two added titles
runs a query per title, and fails the test. `GROWS_TODAY` lists the ones that
still do. It only shrinks: a route fixed there fails the test until it leaves
the list.

## Switching it off

**Admin → Performance → Measuring**, or `KROMA_PROFILING=off`, which the page
cannot override. Off, no scope opens, a statement costs one atomic load, and
no `Server-Timing` is sent.

## What it does not see yet

- The session lookup inside `kroma-module-host`'s `AuthUser` runs on a thread
  the request's scope is not carried to: one statement per request counts as
  `(unattributed)` until that crate carries it, which moves the modules.
- A connection opened before `kroma_perf::install()` is not traced. The server
  installs it before the first database opens.
- CPU time inside a function: a sampling profiler is not in yet.
