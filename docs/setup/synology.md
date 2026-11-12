# Install KROMA on a Synology NAS

There are two ways to run KROMA on a Synology NAS. Both serve the same KROMA on
port `4040`.

| | KROMA package | Container Manager |
| --- | --- | --- |
| Works on | Intel and AMD models, DSM 7.0 or later | Intel, AMD and some ARM models, DSM 7.2 or later |
| Updates | installs them itself | you pull the new image |
| Hardware transcoding on Intel models | set up for you | you add it to the compose file |
| Access to your folders | you grant it to the `kroma` user | you grant it to the container |

Use the package if your NAS has an Intel or AMD processor. Use Container
Manager on an ARM model, or if you already run your other apps in Docker. To
see your processor, open **Control Panel** > **Info Center** > **General** and
read **CPU**, or look up your model in Synology's
[CPU list](https://kb.synology.com/en-global/DSM/tutorial/What_kind_of_CPU_does_my_NAS_have):
`x86_64` is Intel or AMD, `armv8` is ARM.

## Before you begin

- An administrator account on the NAS.
- Your films and series in a shared folder, such as `video`. See
  [Media folders and permissions](media-folders.md) for how to name them.
- The path of each media folder. In **File Station**, right-click the folder,
  select **Properties**, and copy **Location**, for example
  `/volume1/video/Films`.

## Install the package

### Add the KROMA package source

A package source lets Package Center install KROMA and offer its updates.

1. In DSM, open **Package Center** > **Settings** > **Package Sources**.
2. Select **Add**.
3. In **Name**, enter `KROMA`. In **Location**, enter
   `https://packages.kroma.tv`.
4. Select **OK**, then close **Settings**.

### Install KROMA

1. In **Package Center**, open the **Community** tab.
2. Select **KROMA**, then **Install**.
3. DSM warns that the package comes from a third-party developer and is not
   verified by Synology. Confirm to continue. Every package that Synology did
   not publish shows this warning.
4. In **Media library**, enter the path of your films in
   **Movies folder(s)** and of your series in **TV Shows folder(s)**, for
   example `/volume1/video/Films`. Both fields come filled with an example:
   replace it with your folder, or clear the field if you have none of that
   kind. Separate several folders with a colon. You can change all of this
   later in KROMA.
5. In **Server & storage**, keep port `4040` unless another app uses it.
   Leave **Data folder (optional)** empty unless you want KROMA's database and
   image cache on another volume. If you fill it, create that folder in
   **File Station** first and give the `kroma` user **Read/Write** on it, as in
   [Give KROMA access to your media](#give-kroma-access-to-your-media). KROMA
   cannot start on a data folder it cannot write to.
6. Finish the wizard.

DSM installs and starts KROMA. KROMA cannot see your media yet: the next
section gives it access.

### Give KROMA access to your media

DSM 7 runs each third-party package as its own user, with no access to your
shared folders. KROMA's user is named `kroma`. Grant it access to each shared
folder that holds media:

1. Open **Control Panel** > **Shared Folder**.
2. Select the shared folder, for example `video`, then **Edit**.
3. Open the **Permissions** tab.
4. In the drop-down list at the top left, choose **System internal user**.
5. Find `kroma` and tick the access it needs:
   - **Read only** to watch what you have.
   - **Read/Write** if you will use the **Acquisition** module, which moves
     downloads into your libraries and renames them.
6. Select **Save**.
7. Repeat for every shared folder that holds media.
8. In **Package Center**, open **KROMA**, select **Stop**, then **Run**.

KROMA restarts and scans your folders. To give access to one subfolder only,
use **File Station** instead: right-click the folder, select **Properties** >
**Permission** > **Create**, and choose the `kroma` user.

### Open KROMA

In a browser, open `http://NAS_IP:4040`, where `NAS_IP` is the address you use
to open DSM, such as `192.168.1.10`. You can also open KROMA from DSM's main
menu.

Continue with [First run](first-run.md).

### Install the package by hand

Without the package source, DSM cannot offer updates through Package Center,
but KROMA still updates itself (see [Updates](#updates)).

1. Download `kroma-VERSION-x86_64.spk` from
   [kroma.tv/download](https://kroma.tv/download) or from the
   [releases](https://github.com/kromatv/kroma/releases).
2. In **Package Center**, select **Manual Install**, choose the file, and
   follow the same wizard.

### Updates

The package checks for a new version every six hours and installs it on its
own when nobody is watching. To choose when it updates, open KROMA, go to
**Server** > **Server updates**, and turn off automatic installation.

Package Center may keep showing the version it installed first. KROMA's
**Server updates** page shows the version that runs.

### Hardware transcoding

On an Intel model, the package uses the processor's graphics chip to convert
videos that a screen cannot play. There is nothing to set up. Some models have
nothing to use:

- Models with an AMD Ryzen processor, such as the DS723+, DS923+ and DS1522+,
  have no graphics chip.
- Synology no longer ships the graphics driver on models released in 2025 or
  later, such as the DS225+ and DS425+.

On those, KROMA converts on the processor, which is slow for 4K. Playing the
original file on a screen that supports it avoids the conversion. See
[Hardware transcoding](hardware-transcoding.md).

### Where the package keeps its files

| What | Where |
| --- | --- |
| Database, image cache, installed modules | `/var/packages/kroma/var/data`, or the data folder you chose in the wizard |
| Settings from the wizard | `/var/packages/kroma/var/kroma.conf` |
| Server log | `/var/packages/kroma/var/kroma.log` |

You can read the log in KROMA too, under **Server** > **Logs**. To read the
files themselves, turn on SSH in **Control Panel** > **Terminal & SNMP** and
connect as an administrator.

## Install with Container Manager

Container Manager is Synology's Docker app. It runs on DSM 7.2 or later, on
Intel and AMD models and on these ARM models: DS120j, DS124, DS220j, DS223,
DS223j, DS420j and DS423. Install it from **Package Center** first.

1. In **File Station**, open the `docker` shared folder, which Container Manager
   created, and create a folder named `kroma`. Inside `kroma`, create a folder
   named `data`.
2. Open **Container Manager** > **Project**, then select **Create**.
3. In **Project Name**, enter `kroma`.
4. In **Path**, choose the `docker/kroma` folder.
5. In **Source**, choose **Create docker-compose.yml** and paste:

   ```yaml
   services:
     kroma:
       image: ghcr.io/kromatv/kroma:latest
       container_name: kroma
       restart: unless-stopped
       ports:
         - "4040:4040"
       volumes:
         - ./data:/data
         - /volume1/video:/media
   ```

   Replace `/volume1/video` with the location of your media folder. Keep
   `:/media` at the end.

6. Select **Next** until the summary, then **Done**, and start the project.

Container Manager downloads the image and starts KROMA. Open
`http://NAS_IP:4040` and continue with [First run](first-run.md). When you add
a library, your media is under `/media`.

### Give the container access to your media

The container runs as `root`. If a library stays empty, or the server log shows
`entries skipped` after a scan, grant access to the folder, as Synology advises
for containers:

1. In **File Station**, right-click the media folder and select
   **Properties** > **Permission**.
2. Select **Create**, choose **Everyone**, and tick **Read** (or **Read** and
   **Write** for the Acquisition module).
3. Select **Done**, then **Save**.

**Everyone** means every account on the NAS, not everyone on the internet.

> [!CAUTION]
> Do not run `chmod` on a shared folder. It replaces DSM's permissions with
> plain Unix ones, and Synology documents it as a cause of unexpected access
> problems.

### Update the container

**Server** > **Server updates** in KROMA tells you when a new version is out.
Container Manager does not download a newer image for a running project on its
own, so update over SSH:

1. Turn on SSH in **Control Panel** > **Terminal & SNMP** > **Terminal**.
2. Connect as an administrator, for example with `ssh admin@192.168.1.10`.
3. Download the new image and recreate the container:

   ```bash
   cd /volume1/docker/kroma
   sudo docker compose pull
   sudo docker compose up -d
   ```

   Container Manager versions older than 24.0.2-1542 spell the command
   `docker-compose`, with a hyphen.

Your data stays in `docker/kroma/data`.

### Hardware transcoding in Container Manager

On an Intel model, add these lines under `kroma:` in the project's YAML, in
**Container Manager** > **Project** > `kroma` > **YAML Configurations**:

```yaml
       devices:
         - /dev/dri:/dev/dri
       group_add:
         - "937"
```

`937` is the usual ID of DSM's `videodriver` group. To check it on your NAS,
run `getent group videodriver` over SSH.

## Troubleshooting

### A library stays empty

The `kroma` user, or the container, cannot read the folder. Check the
permissions in [Give KROMA access to your media](#give-kroma-access-to-your-media),
restart KROMA, and read **Server** > **Logs**. See also
[Troubleshooting](troubleshooting.md#a-library-stays-empty-after-a-scan).

### `kroma` is not in the list of users

The list shows local users by default. Choose **System internal user** in the
drop-down list above it.

### Package Center says the package is invalid

DSM only installs a package whose version is higher than the installed one. A
build older than the one you have fails with an error about the file format.
Download the latest version.
