# Admin

Status: **DRAFT** — skeleton only, nothing here is agreed yet.

Running a KROMA server. The audience is one person with a NAS, not an operations team.

## Scope

- First-run: what is asked, in what order, and what is deferred
- Settings that exist, and the ones deliberately not exposed
- Users: inviting, removing, resetting
- Jobs: scans, refreshes, transcodes — visibility, cancellation, scheduling
- Diagnostics: logs, health, what to hand over in a bug report
- Backup and restore: what must survive a reinstall
- Updates: how a server learns it is out of date, and what updating risks

## Open questions

- How much of the server is configurable at runtime versus fixed at deploy?
- What is the recovery path when an admin locks themselves out?

## Must answer

- [ ] The minimum first-run path from install to first playing title
- [ ] What is safe to change while media is playing

## Not in scope

Packaging per platform is [`surfaces.md`](surfaces.md).
