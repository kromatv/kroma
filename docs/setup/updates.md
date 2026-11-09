# Updates and backups

KROMA checks for a new version of the server every six hours. When one is out,
the administration shows a notice, and **Server** > **Server updates** lists
what changed. How the update installs depends on how you installed the
server.

## Choose a channel

**Server updates** follows one of two channels:

- **Stable**: the tested releases.
- **Canary**: a new build for every change, often several a day. Newer, and
  less tested.

Until you choose, KROMA follows the channel of the build you installed. Change
it on the **Server updates** page.

## Update the server

### Synology package

The package installs updates by itself, when nobody is watching anything. To
choose the moment yourself, turn off automatic installation on the **Server
updates** page, then select the update there when it suits you.

### Docker

Download the new image and recreate the container, in the folder of your
compose file:

```bash
docker compose pull
docker compose up -d
```

Your data stays in the data folder or volume. To let the **Server updates**
page install updates for you, run KROMA's host updater beside Docker. It is a
small Python script that you install once on the computer; its setup is in
[server/updater](../../server/updater/README.md#docker-compose-linux-macos-windows-docker-hosts).

### Synology Container Manager, QNAP, Unraid and TrueNAS

Use your NAS's own way to update a container. Each guide gives it:
[Synology](synology.md#update-the-container) and
[Other NAS](other-nas.md).

## Update the apps

| App | How it updates |
| --- | --- |
| iPhone, iPad, Apple TV | TestFlight installs new versions |
| Android from Google Play | Google Play installs new versions |
| Android from an `.apk` file | install the new file over the old one |
| Samsung TV | install the new `.wgt`, signed with the same certificate as before |
| LG TV | install the new `.ipk` |
| macOS, Windows, Linux | the app updates itself |

## Back up your server

Your films and series are never in KROMA's data, so back them up as you
already do. KROMA's data holds your accounts, settings, watch history and
resume positions.

To make a backup:

1. Open **Server** > **Backup**.
2. Under **Export a backup**, select **Export**.
3. Turn on **Encrypt with a password**, and enter a password in
   **Encryption password**.
4. Select **Export**.

KROMA downloads a file named `kroma-backup-DATE.kroma`. Keep it somewhere safe.

> [!WARNING]
> Without a password, the backup holds password hashes and API keys in clear
> text. Always set one, and keep it: you need it to restore.

The backup does not include the catalogue of films and series: a scan rebuilds
it on the machine you restore to.

## Restore or move to another machine

1. Install KROMA on the new machine and create a first account.
2. Open **Server** > **Backup**.
3. Under **Import a backup**, select **Import a file** and choose the backup.
4. Enter its password, then select **Restore**.

KROMA restores the accounts, settings and history, then scans your libraries.
If your media folders have another path on the new machine, change them under
**Sources** and scan again.
