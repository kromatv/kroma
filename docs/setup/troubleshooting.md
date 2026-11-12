# Troubleshooting

Problems people meet when they set up KROMA, with their cause and the fix. Each
heading is what you see. Start by reading the server log: it usually names the
problem.

## Read the server log

- **In KROMA**: **Server** > **Logs**.
- **Docker**: `docker compose logs kroma`, in the folder of the compose file.
  Add `-f` to follow it live.
- **Synology package**: `/var/packages/kroma/var/kroma.log`, over SSH.
- **Container Manager, QNAP, Unraid, TrueNAS**: the log of the `kroma`
  container, in the app manager.

For more detail, set `RUST_LOG=debug` and restart KROMA. Remove it afterwards:
the debug log grows fast.

## Find the server's address

The server's address on your network is a number such as `192.168.1.50`.

- **On a NAS**: the address you use to open its admin page.
- **On Linux**: run `hostname -I`. The first number is usually the one.
- **On a Mac**: **System Settings** > **Wi-Fi** or **Network** > **Details**.
- **In your router**: the list of connected devices shows every address.

KROMA is at that address on port `4040`: `http://192.168.1.50:4040`.

## The web page does not open

1. Check that the server runs:
   - Docker: `docker compose ps` shows `kroma` as `running`.
   - Synology package: **Package Center** shows KROMA as **Running**.
2. Check the address. It starts with `http://`, not `https://`, and ends with
   `:4040`.
3. Open `http://SERVER_IP:4040/api/health` in the browser. If it answers with
   `"status":"ok"`, the server works and the problem is in the browser: clear
   its cache, or try another one.
4. Check the firewall of the machine that runs KROMA. It must allow TCP port
   `4040`:
   - Synology: **Control Panel** > **Security** > **Firewall** > **Edit Rules**.
   - Linux with ufw: `sudo ufw allow 4040/tcp`.

## `Create the owner account from the server's local network`

You opened KROMA through an address from outside your network, such as a
tunnel or a domain name. The first account can only be created from home. Open
KROMA with its local address, such as `http://192.168.1.50:4040`, from a device
on the same network.

## A library stays empty after a scan

KROMA cannot see or read the folder, or does not recognize the files in it.

1. Read the log after a scan. Two warnings point at this problem:
   `entries skipped`, followed by the folder and one file KROMA could not open,
   and `configured libraries produced no items`.
2. Check that the folder exists where KROMA looks:
   - Docker: the library folder must be the path inside the container, such as
     `/media/Films`. List it from inside:

     ```bash
     docker compose exec kroma ls /media
     ```

     An empty answer means the folder is not mounted. Check the `volumes:` lines
     of the compose file.
   - Synology package: the path starts with `/volume1/`, or the number of your
     volume.
3. Give KROMA read access to the folder:
   - Synology package: [give the `kroma` user access](synology.md#give-kroma-access-to-your-media),
     then restart KROMA.
   - Docker: the user in `user:` must be able to read the folder. See
     [Docker](docker.md#mount-your-media-folders).
4. Check the names of the files. See
   [Name your files](media-folders.md#name-your-files).
5. Under **Server** > **Sources**, select **Scan** on the library.

## A film shows the wrong title or poster

KROMA picked the wrong match from the file name. Signed in as the owner, open
the film, choose **Fix the match**, search for the right title, then select
**Use this title**.
To avoid it, name the folder with the title and the year:
`Blade Runner 2049 (2017)`.

## A TV or app does not find the server

The apps search your home network for a server on port `4040`. The search
fails when:

- the device is on another network than the server, such as a guest Wi-Fi, a
  separate network for TVs, or mobile data;
- your Wi-Fi isolates devices from each other, an option some routers call
  **AP isolation** or **client isolation**;
- KROMA uses another port than `4040`.

In each case, type the address in the app: `http://SERVER_IP:4040`. If even that
fails, open the same address in a browser on that network to check that the
server can be reached from there. To reach KROMA from outside your home, see
[HTTPS, reverse proxies and remote access](network.md).

## A film does not play, or stops to load

A screen that cannot play a file asks the server to convert it. Without a
graphics chip, a 4K conversion can be too slow for the server.

1. Read the log while the film starts. It says whether the server converts
   the video, and on what.
2. Set up [hardware transcoding](hardware-transcoding.md) if the server has a
   graphics chip.
3. Try the film on another device. If it plays there, the first device needs a
   conversion that the server cannot keep up with.

If the player says the server is busy, too many conversions run at once. See
`KROMA_MAX_TRANSCODES` in the [configuration reference](configuration.md#transcoding).

## Report a problem

If this page does not solve it,
[open an issue](https://github.com/kromatv/kroma/issues) with:

- the KROMA version: in the web app, select the version number at the bottom
  of the menu, which copies it;
- how you installed the server: Docker, Synology package, or another NAS;
- the device and model, for a playback problem;
- what you did, what you expected, and what happened instead;
- the lines of the server log from that moment.

The log can hold addresses of your network. Remove what you do not want to
share before you post it.
