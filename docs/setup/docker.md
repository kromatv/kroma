# Install KROMA with Docker

This guide runs the KROMA server in a Docker container on Linux, on a
Raspberry Pi 4 or 5, or on a Mac or Windows computer with Docker Desktop. At
the end, KROMA starts with the computer, serves its web app on port `4040`,
and reads your media folders where they already are.

On a NAS, follow [Synology](synology.md) or [Other NAS](other-nas.md) instead:
they use the same image, with the menus of your NAS.

## Before you begin

- A 64-bit system on an x86-64 or ARM64 processor. On a Raspberry Pi, that
  means the 64-bit Raspberry Pi OS: `dpkg --print-architecture` prints
  `arm64`. The 32-bit system prints `armhf` and cannot run KROMA.
- Docker Engine with the Compose plugin, or Docker Desktop. If
  `docker compose version` prints a version number, you have both. If not,
  follow [Install Docker Engine](https://docs.docker.com/engine/install/) or
  [Docker Desktop](https://docs.docker.com/desktop/).
- The folder that holds your films and series, for example `/srv/media`. See
  [Media folders and permissions](media-folders.md) for how to name what is
  inside it.

## How KROMA stores things

A container is disposable: Docker deletes everything inside it when it
replaces it, for example during an update. So KROMA keeps nothing important
inside the container. It uses two folders that live on your computer and that
Docker shows to the container:

| On your computer | In the container | What it holds | Access |
| --- | --- | --- | --- |
| `~/kroma/data` | `/data` | KROMA's database, settings, posters, installed modules, downloads in progress | read and write |
| `/srv/media` | `/media` | your films and series | read, and write if KROMA downloads for you |

In the compose file, each line under `volumes:` reads `ON_YOUR_COMPUTER:IN_THE_CONTAINER`.
Change the part before the colon to match your computer. Keep the part after
the colon as it is.

KROMA writes files as the user the container runs as. The compose file below
runs it as your own user, so that the files KROMA creates in your media folder
belong to you, as if you had created them yourself.

## Install KROMA

1. Find your user ID and group ID:

   ```bash
   id -u
   id -g
   ```

   Note both numbers. On most Linux systems the first user has `1000` and
   `1000`. On a Mac, it is usually `501` and `20`.

2. Create a folder for KROMA, with a `data` folder inside it, and go into it:

   ```bash
   mkdir -p ~/kroma/data
   cd ~/kroma
   ```

   Create `data` yourself, now. If Docker creates it, it belongs to `root`, and
   KROMA cannot write to it.

3. Create a file named `docker-compose.yml` in that folder, with this content:

   ```yaml
   services:
     kroma:
       image: ghcr.io/kromatv/kroma:latest
       container_name: kroma
       restart: unless-stopped
       user: "1000:1000"
       ports:
         - "4040:4040"
       volumes:
         - ./data:/data
         - /srv/media:/media
   ```

   Replace the following:

   - `1000:1000`: your user ID and group ID from step 1.
   - `/srv/media`: the folder that holds your films and series.

4. Check that your user can write to your media folder:

   ```bash
   touch /srv/media/kroma-test && rm /srv/media/kroma-test
   ```

   If this prints `Permission denied`, KROMA will not be able to write there
   either. Read-only access is enough to watch: see
   [Mount your media folders](#mount-your-media-folders).

5. Start KROMA:

   ```bash
   docker compose up -d
   ```

   Docker downloads the image, about 100 MB, and starts the container.

## Check that it works

1. Read the log:

   ```bash
   docker compose logs kroma
   ```

   The last lines include `KROMA listening on http://0.0.0.0:4040`.

2. In a browser on the same network, open `http://SERVER_IP:4040`. Replace
   `SERVER_IP` with the address of the computer that runs Docker, such as
   `192.168.1.50`. On that computer itself, `http://localhost:4040` works too.

KROMA shows the form to create the owner account. Continue with
[First run](first-run.md). When you add a library, choose the folder under
`/media`, which is where your media folder appears inside the container.

## Mount your media folders

The line `- /srv/media:/media` makes `/srv/media` on your computer appear as
`/media` inside the container. KROMA only sees the folders you mount.

**Several folders.** Mount each one under `/media`:

```yaml
    volumes:
      - ./data:/data
      - /mnt/disk1/films:/media/films
      - /mnt/disk2/series:/media/series
```

**Read-only.** If you only watch what you already have, add `:ro` at the end
of a media line. KROMA can then read the folder and never change anything in
it:

```yaml
      - /srv/media:/media:ro
```

With `:ro`, the **Acquisition** module cannot import downloads into that
folder. Remove `:ro` when you want it to.

**Links.** If your library holds symbolic links to files somewhere else, mount
the folder the links point to as well, at the same path as on your computer.
A link to a folder the container cannot see cannot be opened.

**Network shares.** If your media is on another NAS, mount the share on the
computer that runs Docker first, then mount that folder into the container as
above.

## Update KROMA

Download the new image and recreate the container:

```bash
cd ~/kroma
docker compose pull
docker compose up -d
```

Your data and settings stay in `~/kroma/data`. **Server** > **Server updates**
in KROMA tells you when a new version is out. To let KROMA install updates
itself, set up the host updater described in
[Updates and backups](updates.md#docker).

The image has several tags:

| Tag | What it follows |
| --- | --- |
| `latest` | the newest build, made from every change: the Canary channel |
| `stable` | the newest release: the Stable channel |
| `0.1` | the newest release of 0.1 |
| `0.1.39` | that release, which never changes |

Every build also has a tag of its own, such as `0.1.39.3607024`. Pin a release
or a build to choose when you update.

## Stop or remove KROMA

Stop the server, and start it again later:

```bash
docker compose stop
docker compose start
```

Remove the container. Your data stays in `~/kroma/data`:

```bash
docker compose down
```

To remove everything, delete `~/kroma` after `docker compose down`. Your media
folders are never touched.

## Optional: hardware transcoding

If the computer has an Intel processor with graphics, KROMA can use it to
convert videos that a screen cannot play, instead of the processor itself. Add
the device and the group that may open it:

```yaml
       devices:
         - /dev/dri:/dev/dri
       group_add:
         - "993"
```

Replace `993` with the ID of the `render` group on your computer:

```bash
getent group render | cut -d: -f3
```

See [Hardware transcoding](hardware-transcoding.md) for NVIDIA cards and for
how to check that it works.

## Optional: run as root

If you leave out the `user:` line, KROMA runs as `root` inside the container.
It can then read and write any folder you mount, but every file it creates
belongs to `root`, and your own account may not be able to rename or delete
it. Running as root also lets you keep the data in a Docker volume instead of
a folder:

```yaml
services:
  kroma:
    image: ghcr.io/kromatv/kroma:latest
    container_name: kroma
    restart: unless-stopped
    ports:
      - "4040:4040"
    volumes:
      - kroma-data:/data
      - /srv/media:/media

volumes:
  kroma-data:
```

A Docker volume and a `user:` line do not work together: Docker creates the
volume for `root`, and KROMA stops with
`unable to open database file: /data/kroma.db`.

## Optional: one mount for data and media

When the Acquisition module imports a download, it can create a hard link
instead of a copy, which is instant and takes no extra space. That works only
if the download and the library are in the same mount. Separate mounts, such
as `./data` and `/srv/media`, always copy.

To get hard links, put KROMA's data folder on the same disk as your media and
mount their common parent once:

```yaml
       environment:
         KROMA_DATA_DIR: /srv/kroma-data
       volumes:
         - /srv:/srv
```

Your media is then at `/srv/media` inside the container too. Create
`/srv/kroma-data` before you start KROMA, owned by the user in `user:`.

## Optional: run without Compose

The same setup as a single command:

```bash
docker run -d --name kroma --restart unless-stopped \
  --user 1000:1000 \
  -p 4040:4040 \
  -v ~/kroma/data:/data \
  -v /srv/media:/media \
  ghcr.io/kromatv/kroma:latest
```

## Troubleshooting

### `Bind for 0.0.0.0:4040 failed: port is already allocated`

Another program uses port `4040`. Change the part before the colon, for
example `"4041:4040"`, then open KROMA on port `4041`. The apps search
your network on port `4040`, so they may not find the server: type the address
in each app.

### `unable to open database file: /data/kroma.db`

KROMA cannot write to its data folder. Either the folder belongs to another
user than the one in `user:`, or the compose file uses a Docker volume with
`user:`. Create `~/kroma/data` yourself and use `./data:/data`, or give the
folder to your user:

```bash
sudo chown -R 1000:1000 ~/kroma/data
```

### A library stays empty

KROMA cannot read the folder, or the folder is not mounted. See
[Troubleshooting](troubleshooting.md#a-library-stays-empty-after-a-scan).

### The apps do not find the server

The apps search your network for a server on port `4040`. If you changed the
port, or the TV is on another network such as a guest Wi-Fi, type the address
in the app: `http://SERVER_IP:4040`.

## Next steps

- [First run](first-run.md): create your account and add your libraries.
- [TVs](tv.md): install KROMA on your television.
- [Configuration reference](configuration.md): every setting you can pass in
  `environment:`.
