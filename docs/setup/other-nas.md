# Install KROMA on QNAP, Unraid or TrueNAS

These NAS systems run KROMA from the same Docker image as any Linux computer.
This guide gives the steps in each one's own app manager. The ideas behind
them, such as what a mount is and why permissions matter, are explained in
[Docker](docker.md#how-kroma-stores-things).

For a Synology NAS, see [Synology](synology.md).

## QNAP

You need QTS 5.1 or QuTS hero h5.1 or later, with **Container Station** 3
installed from the **App Center**.

1. In **File Station**, create a folder for KROMA's data, for example
   `Container/kroma/data`.
2. Open **Container Station**, then **Applications** > **Create**. On recent
   versions, the button is under **Explore** > **Create Application**.
3. In **Application name**, enter `kroma`.
4. Paste this YAML:

   ```yaml
   services:
     kroma:
       image: ghcr.io/kromatv/kroma:latest
       container_name: kroma
       restart: unless-stopped
       ports:
         - "4040:4040"
       volumes:
         - /share/Container/kroma/data:/data
         - /share/Multimedia:/media
   ```

   On a QNAP, every shared folder is under `/share`. Replace `Multimedia` with
   the shared folder that holds your media, as **File Station** names it, and
   `Container/kroma/data` with the folder from step 1.

5. Select **Validate**, then **Create**.

Container Station downloads the image and starts KROMA. Open
`http://NAS_IP:4040` and continue with [First run](first-run.md). Your media is
under `/media` when you add a library.

To update, open the application in **Container Station** and recreate it, or
run `docker compose pull` and `docker compose up -d` over SSH in the folder of
the application.

## Unraid

Unraid has no Docker Compose of its own, so you add KROMA as a container in the
**Docker** tab.

1. In the **Docker** tab, select **Add Container**.
2. Fill in:
   - **Name**: `kroma`
   - **Repository**: `ghcr.io/kromatv/kroma:latest`
   - **Network Type**: `Bridge`
3. Select **Add another Path, Port, Variable, Label or Device** three times, and
   add:

   | Type | Name | Container | Host | Access mode |
   | --- | --- | --- | --- | --- |
   | Port | Web | `4040` | `4040` | |
   | Path | Data | `/data` | `/mnt/user/appdata/kroma` | Read/Write |
   | Path | Media | `/media` | `/mnt/user/media` | Read Only, or Read/Write for the Acquisition module |

   Replace `/mnt/user/media` with the share that holds your media.

4. Select **Apply**.

Unraid creates the folders, downloads the image and starts KROMA. Open
`http://NAS_IP:4040` and continue with [First run](first-run.md).

KROMA runs as `root` in the container. If you let the Acquisition module write
into your shares, the files it creates belong to `root`. If your other apps or
your SMB clients then cannot change them, run **Tools** > **Docker Safe New
Perms**.

To update, select the KROMA icon in the **Docker** tab, then
**Check for Updates**, and apply the update.

## TrueNAS

TrueNAS Community Edition runs apps on Docker since version 24.10 (Electric
Eel). Earlier versions are not covered here.

### Prepare the datasets

TrueNAS only lets an app into a dataset whose permissions allow it. KROMA runs
as the **apps** user, ID `568`.

1. In **Datasets**, create a dataset for KROMA's data, for example
   `tank/apps/kroma`, with the **Apps** preset. The preset already gives the
   **apps** group full control.
2. Select the dataset that holds your media, then **Permissions** > **Edit**.
3. Select **Add Item**, choose **Group** > **apps**, and give it **Read**, or
   **Modify** for the Acquisition module.
4. Select **Save Access Control List**.

### Install the app

1. Open **Apps** > **Discover Apps**, select the menu at the top right, then
   **Install via YAML**.
2. In **Name**, enter `kroma`. It must be lowercase.
3. In **Custom Config**, paste:

   ```yaml
   services:
     kroma:
       image: ghcr.io/kromatv/kroma:latest
       restart: unless-stopped
       user: "568:568"
       ports:
         - "4040:4040"
       volumes:
         - /mnt/tank/apps/kroma:/data
         - /mnt/tank/media:/media
   ```

   Replace `tank/apps/kroma` and `tank/media` with your datasets. Keep the
   part after each colon.

4. Select **Save**.

TrueNAS downloads the image and starts KROMA. Open `http://NAS_IP:4040` and
continue with [First run](first-run.md).

To update, open the app in **Apps** and select **Update** when TrueNAS shows
that one is available.

## Troubleshooting

If KROMA does not start, or a library stays empty, read the log of the
container in your NAS's app manager, then see
[Troubleshooting](troubleshooting.md). The most common cause is a folder that
the container's user cannot read or write.
