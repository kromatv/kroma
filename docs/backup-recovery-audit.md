# Backup and migration recovery audit

Reviewed 2026-10-29, alongside the server updater implementation.

## Answer

The portable backup covers important irreplaceable application data, but it is
**not a complete installation snapshot or a guaranteed rollback point**. The
updater does **not automatically roll back the application and databases**.
A failing versioned SQLite migration step rolls back its own transaction; earlier
successful steps remain committed. Restoring an older application alone can be
refused because the database is already at a newer schema version.

## What is covered

`server/crates/kroma-db/src/backup.rs` explicitly exports accounts, settings,
requests/monitoring, invitations, playback history, resume progress, watched state,
My List, passkeys, notification preferences, reports, TMDB pins/file bindings,
job schedules, and downloaded subtitle rows. Module SQLite tables are exported
from each installed module's `module.sqlite`. The ZIP adds uploaded avatars and
available generated/downloaded subtitle files. Encryption is available for a
manual export; pre-update ZIPs are private local files with mode 0600 on Unix.

A schema coverage test requires every core table to be explicitly exported or
explicitly excluded. It passes. This is useful protection against a newly added
core table silently being forgotten; it does not inventory arbitrary files.

## Intentional exclusions

Media, the scanned catalogue, generated artwork/analysis/caches, sessions and
device tokens, temporary credentials, notifications/job history, metrics and
machine-specific transient state are excluded. Library IDs/settings travel so a
rescan can reconnect stable media IDs to watch history. Devices need to sign in
again after a portable restore. Statistics identity and update discovery/progress
state are not portable. This review added `update.operation` to those exclusions.

The archive does not copy the full data directory, installed module binaries,
module files outside SQLite, TLS certificate/private-key files, Compose files,
environment settings, DSM configuration, updater host configuration, or prior
application distributions/images. Some can be regenerated or reconfigured;
they still matter to full disaster recovery and require a separate host backup.

## Findings and follow-up tasks

- **P1: A backup can succeed while module data was omitted.**
  `export_portable` logs unreadable module databases and continues.
  `module_stores` also treats directory-read errors as an empty inventory.
  Add an explicit manifest of expected stores/files and a strict pre-update
  export mode that refuses installation when required data cannot be read.
- **P1: Restore can report success after a partial restore.**
  `restore_modules` skips absent module databases and logs restore failures.
  Asset restore ignores mkdir/write errors. Core rows commit before module
  restoration, and files are written before the core transaction. Return a
  structured restore report, fail on required missing assets/stores, and stage
  a complete restore before replacing the live state.
- **P1: No coordinated rollback exists for an entire upgrade.**
  Versioned migrations commit one step at a time. The regression test
  `a_failing_step_leaves_the_database_at_the_version_before_it` proves that an
  earlier successful step remains applied. The updater only verifies health and
  reports failure; it neither restores snapshots nor reinstalls the old image/SPK.
  Add a host-managed recovery bundle with the previous distribution identity,
  coordinated database/file snapshots, and an offline restore procedure tested
  with injected failures. Never launch an older binary against an upgraded DB.
- **P1: Migration snapshots are best-effort.**
  `kroma-sqlite/src/migrate.rs` uses `VACUUM INTO` and retains two pre-upgrade
  copies, but logs a failed snapshot and continues migrating. Require a verified
  recoverable snapshot before destructive migration; make failure visible and
  prevent installation from proceeding without the intended safety net.
- **P2: Export is not a single consistent snapshot across stores.**
  Core tables and module tables are read sequentially without an export-wide
  read transaction. Concurrent writes can produce a logically mixed backup.
  Use consistent read snapshots and define how cross-store writes are quiesced.
- **P2: File/schema completeness is not recorded.**
  Module exports contain rows, not module distributions, schemas, indexes,
  triggers or arbitrary persisted files. Missing avatar/subtitle files are
  skipped. Record module versions/schema versions, required files, integrity
  hashes, omissions and restore compatibility in a versioned manifest.
- **P2: Recovery has not been certified on deployment targets.**
  Run a full backup → update → injected migration failure → recovery drill on
  Docker amd64/arm64 and DSM, including module data, credentials, user assets
  and watch history. Exercise disk-full, unreadable stores and failed downloads.
  Add retention/free-space checks and an off-host backup policy.

These are follow-up implementation tasks, not claims of completed recovery work.
The current automation must be described as backup-before-update with failure
reporting and manual recovery, not automatic rollback or a full-machine backup.

## Validation performed

- `cargo test -p kroma-db --features testing backup::`: 16 passing tests.
- `cargo test -p kroma-sqlite migrate::`: 9 passing tests.
- `cargo test -p kroma-engine services::backup --lib`: 19 passing tests.

These cover row/asset roundtrips, encrypted exports, archive bounds, table
classification, orphan progress, module SQLite rows, newer backup/schema
rejection, per-step rollback and pre-migration snapshot retention. They do not
prove a coordinated multi-store or full-installation rollback.

## Related updater review fix

During the live restart UX check, a temporary 502/network failure cleared the
active session and routed the viewer away from update progress. The shared auth
hook now retains the active account on transient failures, while authentication
rejections still clear it. Regression tests cover offline boot, 502 boot and a
503 during refresh.
