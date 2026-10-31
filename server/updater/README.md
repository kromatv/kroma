# Server updates

KROMA checks the selected Stable or Canary release every six hours and offers
**Admin → Server updates**. A **New** badge in Admin navigation and a dashboard
notice announce available releases. Automatic installation is off by default,
except in the Synology package (see [Synology DSM 7](#synology-dsm-7)).
An owner can start an update, review the restart notice, and confirm, or opt in
to **Install automatically when idle**. The server saves a portable
backup before handing the exact reviewed version/build to a host updater.

Until the owner chooses a channel, the server follows the channel its running
build was published on. A build that a stable release ships follows Stable.
Any other build, such as a canary `.spk` from kroma.tv, follows Canary.

With automatic installation enabled, a discovery check can prepare a new
release immediately if the server is idle; a separate job retries idle eligibility
every ten minutes. Playing and paused sessions both defer it. The host checks
for playback again after downloading, immediately before replacing the service.
Turning automatic installation off while it is waiting stops that handoff.
Turning release checks off also turns automatic installation off. The option
follows the selected Stable/Canary channel and is available only with a connected
host updater. An in-progress installation cannot be undone by changing a setting.
Failed builds require a manual retry; they are never retried in an unattended loop.
The native command adapter must preserve these idle checks immediately before
restarting if its own download/preparation takes time.

## Delivery and trust

The server cannot replace a Docker container or grant itself DSM administration.
`kroma_updater.py` runs **outside KROMA**, supervised by the host. It needs Python
3.9+ and no pip packages. Only the bridge directory is shared with KROMA. Keep
the updater script, configuration, and state owned by the host administrator,
outside that directory. Do not expose the bridge as a web directory or mount
the Docker socket in the media server.

The updater publishes a heartbeat, accepts one durable request at a time,
independently verifies the official release, installs it, and checks both the
server identity and exact build through `/api/health`. A host journal prevents
an interrupted installation from being executed twice. A failed or timed-out
installation is visible in Admin. An offline updater disables installation;
release discovery still works. Backup, verification/download, installation, and
restart progress are shown as the page's main card, and survive a page reload.

### Docker Compose (Linux, macOS, Windows Docker hosts)

1. Copy `kroma_updater.py` to an administrator-owned location on the **Docker
   host**, e.g. `/opt/kroma-updater/`. Run it with the same Docker context and
   Compose project/environment as the original deployment.
2. Create `/opt/kroma/update-bridge`, writable by KROMA's container UID and the
   host updater, accessible only to those users. On POSIX hosts use a shared
   group and setgid on this directory so new updater files inherit that group.
   Shared status files use mode 0640; private host state remains mode 0600.
   Bind mount it and set:

   ```yaml
   services:
     kroma:
       environment:
         KROMA_UPDATE_DIR: /updates
       volumes:
         - /opt/kroma/update-bridge:/updates
   ```

3. Save this as `/etc/kroma-updater.json`, readable/writable only by the host
   administrator. Use absolute paths; include all original Compose files in
   their original order. `project` must match `docker compose ls`.

   ```json
   {
     "platform": "docker",
     "bridge_dir": "/opt/kroma/update-bridge",
     "state_dir": "/var/lib/kroma-updater",
     "health_url": "http://127.0.0.1:4040/api/health",
     "project": "kroma",
     "service": "kroma",
     "compose_files": ["/opt/kroma/docker-compose.yml"]
   }
   ```

4. Run `python3 /opt/kroma-updater/kroma_updater.py --config
   /etc/kroma-updater.json` under your host's service manager (systemd example
   below; launchd on macOS or a persistent Task Scheduler task on Windows).
   Recreate the server once to apply the bridge mount/environment.

The adapter pulls `ghcr.io/kromatv/kroma:<version>.<build>`, verifies its payload
label, resolves it to a digest, then runs Compose `up -d --no-deps --no-build
--pull never` for the configured service only. Bind mounts and volumes are
preserved. Existing releases without the payload label cannot be installed via
this adapter; the new label ships with this implementation.

**Future Compose operations must include the saved image override** so they do
not revert to the original image tag:

```sh
docker compose --project-name kroma -f /opt/kroma/docker-compose.yml \
  -f /var/lib/kroma-updater/image.compose.json up -d
```

The override is created on the first update. Keep it with deployment state.
The service account must be able to read the original `.env` file; environment
substitution must resolve the same way as your normal Compose deployment. On
Windows use Windows paths in JSON (escaped backslashes or forward slashes).

### Synology DSM 7

The package updates itself, with no setup. DSM 7 runs a third-party package as
its own user, and that user may not call the package manager. So the server
downloads the reviewed `.spk` from the official release, requires GitHub's
SHA-256 asset digest and verifies it, and unpacks the payload into
`/var/packages/kroma/var/releases/<build>`. Then it stops cleanly, module
sidecars included, and exits with status 75. The package's service script then
starts the newest payload: the one in `releases/` or the one Package Center
installed, whichever build is higher. It deletes the others.

Automatic installation when idle is on by default here. Turn it off in
**Admin → Server updates**. Package Center keeps showing the version it
installed. The page shows the build that runs. The first package with this
service script must be installed once through Package Center. Later updates
replace only the server, the web app and ffmpeg. A change to the package scripts
still needs an install through Package Center.

A new build that does not start leaves the service stopped. The script does not
go back to the previous build, because the new build may have migrated the
database. To recover, install a later build through Package Center, or follow
[Backup and recovery](#backup-and-recovery).

The host updater below remains available. When `KROMA_UPDATE_DIR` is set, the
server hands updates to it instead of updating itself.

Run the updater on DSM itself, independently of the package being replaced.
Install Python 3.9+ and put the script in an administrator-owned location
outside `/var/packages/kroma/target`. Create a private shared bridge, grant
`sc-kroma` write access through a shared group with setgid on the bridge so
the package can read the updater's group-readable status files. Add to
`/var/packages/kroma/var/kroma.conf`:

```sh
export KROMA_UPDATE_DIR=/volume1/kroma-update-bridge
```

Restart KROMA through Package Center. Use this administrator-owned config:

```json
{
  "platform": "synology",
  "bridge_dir": "/volume1/kroma-update-bridge",
  "state_dir": "/volume1/kroma-updater-state",
  "health_url": "http://127.0.0.1:4040/api/health",
  "arch": "x86_64"
}
```

Create a **root** DSM Task Scheduler task, every minute, running:

```sh
/path/to/python3 /volume1/admin/kroma_updater.py \
  --config /volume1/admin/kroma-updater.json --once
```

Concurrent tasks are locked out. The independent task survives package stop and
replacement. The adapter downloads the exact architecture's `.spk` from the
official release, requires GitHub's SHA-256 asset digest, verifies it, and calls
`/usr/syno/bin/synopkg install` followed by `synopkg start kroma`. It does not
modify DSM's package privilege policy. Only architectures with a published SPK
are supported (currently x86_64); an absent asset or digest fails before install.
DSM trust/package-policy rejection remains visible as an update failure. Validate
the adapter on the DSM model/version you distribute before enabling it there.

### Native binaries, service managers, and other package systems

The bridge and journal are portable. To integrate another installation, set
`KROMA_INSTALL=binary` and `KROMA_UPDATE_DIR`, and supervise the updater outside
the server's process/service. Use `platform: "binary"` and provide a fixed
**argument array** in the host config:

```json
{
  "platform": "binary",
  "bridge_dir": "/var/lib/kroma-update-bridge",
  "state_dir": "/var/lib/kroma-updater",
  "health_url": "http://127.0.0.1:4040/api/health",
  "command": ["/usr/local/libexec/install-kroma"]
}
```

The command receives the reviewed request as JSON on stdin (`target.channel`,
`target.version`, `target.build`). It must verify/download the platform artifact,
replace the **complete distribution** including web assets, preserve the data
directory, restart the server, and exit nonzero on failure. It must not treat
stdin as shell code. No shell is invoked by the bridge. The updater then verifies
the exact running build. This is an extension point: native macOS/Windows/Linux
server installers are not bundled here. The desktop app retains its own updater.
Forks/custom release servers need a corresponding host adapter; the built-in
adapters intentionally trust only `kromatv/kroma` releases.

## Linux service example

Install `kroma-updater.service` into `/etc/systemd/system/`, adjust script/config
paths and host permissions, then:

```sh
sudo systemctl daemon-reload
sudo systemctl enable --now kroma-updater.service
```

Keep service logs private: native install commands may print host configuration.
The API receives only a short error, never command output. Use the host's service
logs for command diagnostics.

## Backup and recovery

Before publishing a request, the server writes a private portable ZIP to
`<KROMA_DATA_DIR>/update-backups/<request-id>.zip`. Failure to create the backup
prevents installation. Backups include accounts, watch history, settings and
portable module data; they exclude media and regenerable caches. Export an
off-host copy through Admin → Backup too. Backups are retained until the operator
removes them; monitor space and protect these files like the live database.

This is a portable application export, not a complete installation snapshot.
See the [backup and recovery audit](../../docs/backup-recovery-audit.md) for
known partial-export/restore behavior and the remaining rollback work.

Health must return the same `instanceId` and the selected version **and build**
within five minutes (host config `health_timeout` can adjust this). A failure does
not trigger an automatic downgrade: a migrated database may not be readable by
an older server. Inspect the host logs, fix the installation, or restore the
portable backup on a suitable version through Admin → Backup. If the updater
crashed, restart it to reconcile health before starting another update. Do not
remove an active journal/request to force a second installation.

Changing from Canary to Stable never downgrades the database: Stable must catch
up to the installed version/build before an update is offered.

## Validation

```sh
python3 -m unittest discover -s server/updater -v
cd server && cargo test -p kroma-engine services::updates --lib
cargo test -p kroma-server --features kroma-db/testing api::it_updates
```

CI also runs these tests with the pinned `coverage` development tool, requires
at least 95% line coverage, and imports the XML report into SonarCloud. The
updater itself continues to need only the Python standard library.

Docker/DSM commands are exercised with test doubles. Actual container replacement,
DSM trust policies and a full migration/recovery drill require a deployment test;
unit tests do not claim that certification.

References: [Compose up](https://docs.docker.com/reference/cli/docker/compose/up/),
[Compose file merging](https://docs.docker.com/reference/cli/docker/compose/),
[DSM package lifecycle](https://help.synology.com/developer-guide/synology_package/script_env_var.html).
