# Security policy

## Reporting a vulnerability

Report privately through GitHub: **Security → Advisories → Report a vulnerability**
([direct link](https://github.com/maxscharwath/kroma/security/advisories/new)).
Private vulnerability reporting is enabled on this repository, so the report stays
between you and the maintainer until a fix ships.

Do not open a public issue or a pull request for a vulnerability.

Include what you have: the affected component, the version or commit, the steps to
reproduce, and what an attacker gains. A proof of concept helps; a CVSS score is not
required.

Expect an acknowledgement within a few days. KROMA is maintained by one person in the
open, so there is no guaranteed remediation window — the advisory thread is where the
timeline gets agreed.

## Supported versions

Only the latest release is supported. KROMA ships from `main` on a rolling `v0.1.x`
line, and modules release independently on their own `<module-id>@<version>` tags.
Fixes land in the next release rather than being backported.

## Scope

In scope:

- the Rust server (`server/`), including the module host and supervisor
- first-party modules (`modules/`), which run as separate processes with their own
  network surface and their own SQLite access
- the clients (`clients/`) and the shared libraries (`packages/`)
- the push relay Worker (`packages/push-relay/`), which holds the credentials the
  published apps cannot
- the module registry and the artifact verification path
  (see [`docs/module-registries.md`](docs/module-registries.md))

Out of scope:

- a self-hosted deployment exposed to the internet without a reverse proxy, TLS or
  authentication — KROMA assumes the operator controls that boundary
- vulnerabilities in third-party trackers, indexers or media sources a module talks to
- findings that require an already-compromised host or physical access to it
- reports from automated scanners with no demonstrated impact

## What this project already assumes

Two invariants are load-bearing, and a report that breaks either one is worth filing
even without a full exploit:

- **Secrets never live in the server or the app.** The server's source is public and
  self-hosted; anything Apple or Google issued to the published app lives in the relay
  Worker's secrets.
- **Every trust boundary is parsed, not trusted.** HTTP bodies, stored blobs,
  third-party JSON and cross-process module messages go through a zod or serde schema,
  with the body size bounded before parsing.

Module bundles are sha256-verified against their catalog entry before being unpacked,
and the official registry wins any id clash with an operator-added one.
