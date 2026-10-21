# Database migrations

The core database is versioned with `PRAGMA user_version`. A new file starts
from a baseline, every change since is a numbered step, and a database that is
already up to date costs one read of its file header at boot.

The engine lives in `kroma-sqlite` (`migrate`, `Schema`, `Step`). A module's own
database takes the same steps through `ServerModule::steps()`; see
[`modules/README.md`](../modules/README.md#changing-the-modules-own-schema). The core's history is in
`server/crates/kroma-db/src/schema/`.

| File | What it holds |
|---|---|
| `baseline.sql` | The shape a new database starts from, generated, never edited by hand |
| `steps.rs` | Every step since the baseline, oldest first |
| `steps/NNNN_name.sql` | One step's SQL, compiled into the binary with `include_str!` |
| `legacy.rs` | The pre-versioning schema and migration list, run once on an old database |
| `fixtures/vX.Y.Z.sql` | The schema real releases left behind, for the upgrade tests |

## Adding a change

```bash
bun run ci schema new users_theme
```

This creates `steps/0002_users_theme.sql` and appends it to `steps.rs`. Write
the SQL, then run `cargo test -p kroma-db schema::`. The tests build a new
database and upgrade every fixture release, and fail if the two disagree on any
table, column, index or foreign key.

A step runs once, in its own transaction, and records its version in the same
commit. If it fails, the database stays at the version before it and the server
does not start, naming the step.

A step that has shipped is never edited. A fix is a new step.

### When SQL is not enough

- **A table rebuild** (dropping NOT NULL, changing a type or a key, the
  12-step procedure from the SQLite docs): set `rebuilds: true`. Foreign keys go
  off around the step, and it is refused if any row points at one it removed.
- **Data that needs Rust**: `run: Run::Code(fn)`. The function gets the step's
  transaction.
- **Long backfills** do not belong in a step: a step blocks the boot. Queue them
  as a job.

### Work outside the database

A transaction can take back a column, not a file that was moved. Work on the
data directory (moving artwork, rewriting a cache, renaming a folder) is an
upgrade task instead: an entry in `TASKS` in
`kroma-engine/src/services/upgrade_tasks.rs`, with a name it keeps forever and
a `run(&SharedState)` that is idempotent and can resume.

Every task the `upgrade_tasks` ledger has not seen finish runs once, in order,
in the background after boot. A failure is logged and recorded with its error,
the next task still runs, and the failed one is tried again at the next boot.
A task that needs the schema a step adds ships in the same release as the step:
steps run before the server starts, tasks after.

## What the engine refuses

- A database written by a newer KROMA (its version is above the last step). It
  is not read with the wrong shape.
- A database older than the baseline, once the baseline has been squashed past
  it. The error says to open it with an earlier release first.

Before upgrading an existing file, the engine copies it beside itself as
`kroma.db.pre-vN` with `VACUUM INTO` and keeps the last two. If the copy cannot
be made (a full disk), it logs a warning and upgrades anyway.

## Databases from before versioning

A database with tables and `user_version = 0` was written by a release that
replayed its whole migration list on every boot. The engine runs that list once
(`legacy.rs`), ignoring only the errors that mean "already applied", logging
any other, and then sets the baseline version. From then on it takes steps like
any other database.

A restored backup still goes through the legacy data migrations, so rows saved
in an older shape are filled in at once.

## Squashing

When the steps pile up, regenerate the baseline from the current schema and
raise `baseline_version` to the last step's version, then delete those steps.
While `legacy.rs` still describes the baseline,
`KROMA_BLESS_SCHEMA=1 cargo test -p kroma-db the_baseline_is` rewrites
`baseline.sql` from it.
