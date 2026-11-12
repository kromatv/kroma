# Server update implementation plan

## Product contract

One update page across installations. Stable and Canary have independent release
checks. Checks run every six hours when enabled; installation requires a manual
confirmation or the owner's explicit opt-in to automatic installation when idle.
Automatic installation follows the chosen channel. It is off by default, except
in the Synology package, which installs updates by itself when idle until the
owner turns that off. Until the owner chooses a channel, the server follows the
channel its running build was published on.
Switching channels does not downgrade. A
restart warning and a portable local backup precede installation.

The Updates page uses KROMA's existing theme, typography, accessible controls and
responsive layout: a release hero compares installed/available builds, an inline
step sequence is the main view during updates and survives refreshes, channel cards explain the tradeoff, and a
platform card explains readiness/setup. The dashboard notice links into this page.

## Implemented sequence

1. Extend the existing cached GitHub discovery contract with host readiness and a
   durable operation. Keep old client compatibility by making new fields optional
   in the client decoder.
2. Add a settings-manager-only install endpoint that revalidates the reviewed
   channel/version/build, rejects duplicates and stale requests, saves a backup,
   and atomically hands a request to a configured private host bridge.
3. Run a separate host updater. Implement Docker Compose (exact payload label +
   digest) and Synology DSM (exact SPK + SHA-256) adapters. Supply a command
   contract for other service/package managers. Keep all privilege and deployment
   paths in operator-owned configuration.
4. Journal on the host; report progress through the bridge; verify exact version,
   build and server identity after restart. Reconcile interrupted installs without
   replay. Preserve failures and require operator recovery rather than downgrade
   a potentially migrated database.
5. Add the dedicated page, stable/canary controls, polling/reconnection, a restart
   confirmation, and English/French copy. Wire a New badge in navigation and dashboard access.
   Add separate controls for discovery and automatic installation, with idle
   eligibility retries every ten minutes and a host idle recheck before restart.
6. Test request validation, backup protection, authorization, host liveness,
   stale builds, digest pinning, tampered packages, restart recovery and UI states.

## Deployment / release acceptance

- Ship the Docker payload identity label before testing one-click container
  replacement. Test stable → stable and canary → canary on amd64 and arm64;
  verify only KROMA changes, mounts persist and the page reconnects.
- Test DSM 7 upgrade on a supported x86_64 NAS with a root scheduler task, package
  trust policy, preserved `var/kroma.conf`, and checksum failure injection.
- Exercise a migration failure and portable restore on a disposable library.
- Native deployments require an operator-supplied artifact installer/restart
  command. Add first-party native adapters when complete server distributions
  and their signing/verification contracts are published for those targets.
- Validate responsive layout, keyboard navigation and restart recovery in the
  deployed client. Unattended installs require explicit opt-in; automatic
  downgrades and module updates are never introduced by server update checks.

Setup and recovery: [server/updater/README.md](../server/updater/README.md).
Backup completeness and rollback follow-up tasks: [backup recovery audit](backup-recovery-audit.md).
