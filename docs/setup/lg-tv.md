# Install KROMA on an LG TV

An LG TV installs apps from outside its store through LG's **Developer Mode**
app, sent from a computer on the same network. This guide turns Developer Mode
on, then installs KROMA with its own installer, in about 15 minutes.

One KROMA file, `KROMA-webos-VERSION.ipk`, works on every LG TV with webOS 4.0
or later, which means sets from 2018 onward. Sets from 2016 and 2017 cannot run
it. It is the native app: it runs on the TV itself, with no browser.

## Before you begin

- An LG TV from 2018 or later.
- A Mac or a Linux computer on the same network as the TV, with
  [Node.js](https://nodejs.org) 22 or later. `node --version` prints the
  version. On Windows, follow
  [Optional: install with webOS Dev Manager](#optional-install-with-webos-dev-manager)
  instead.
- A free LG developer account. Create it on
  [webostv.developer.lge.com](https://webostv.developer.lge.com) with
  **Sign In** > **Create Account**.

## Turn on Developer Mode on the TV

1. On the TV, open the app store, called **Apps** or **LG Content Store**
   depending on the year. Search for **Developer Mode** and install it.
2. Open **Developer Mode** and sign in with your LG developer account.
3. Switch **Dev Mode Status** to **On**. The TV restarts.
4. Open **Developer Mode** again and switch **Key Server** to **On**.

The app now shows the TV's IP address and a six-character passphrase. Keep it
open: the installer asks for the passphrase.

## Install KROMA

The installer asks its questions in English. Use the arrow keys to move and
Enter to answer.

1. In a terminal on your computer, start the installer:

   ```bash
   npx @kromatv/installer
   ```

   The first time, `npx` asks to download the installer. Type `y`, then press
   Enter. The installer shows the KROMA name and a short help. To stop it at
   any time, press Ctrl+C.

2. At **Which version of KROMA?**, choose **Stable**.
3. At **Which kind of TV?**, choose **LG**.

   The installer repeats the steps for the TV. You already did them in
   [Turn on Developer Mode on the TV](#turn-on-developer-mode-on-the-tv).

4. At **Which TVs get KROMA?**, wait for your TV to appear.

   The installer looks for LG TVs on your network. A TV with Developer Mode on
   shows **ready** and is already ticked. Press Space to tick or untick a TV.

5. Press Enter to install.
6. When the installer asks for the passphrase, type the one that the
   **Developer Mode** app shows on the TV, then press Enter.

   The installer gets the key of the TV with the passphrase, and keeps it in
   the `.kroma/keys/webos` folder of your home folder, so later installs and
   updates do not ask for it again. It then downloads the latest KROMA for LG,
   installs it on the TV and starts it. Nothing else is installed on your
   computer.

KROMA opens on the TV and appears in its app list. Follow
[Connect the TV to your server](tv.md#connect-the-tv-to-your-server).

## Keep Developer Mode on

Developer Mode stays on for a limited time. The **Developer Mode** app shows
how much is left: up to 1000 hours on current firmware, 50 hours on older
TVs.

> [!WARNING]
> When the time runs out, the TV turns Developer Mode off and removes KROMA.
> Open **Developer Mode** and select **Extend** before that happens. Once it
> has run out, you turn Developer Mode on and install KROMA again.

webOS Dev Manager can extend the session for you on a schedule.

## Update KROMA

Update KROMA on every TV that this computer installed it on:

```bash
npx @kromatv/installer update
```

The installer asks nothing. The TV keeps your server address and your sign-in.

### Move from the web app to the native app

Before KROMA had a native app, LG TVs got the web app. The next install or
update puts the native app beside it. The two are separate apps, so the TV
then lists KROMA twice, and the native app asks for your server and your
sign-in once.

When the native app works, delete the web app from the TV's app list.

The web app is still in every release, as `tv.kroma.webos_VERSION_all.ipk`.
To install it instead of the native app, install by the address of the TV with
`--web`:

```bash
npx @kromatv/installer install 192.168.1.60 --web
```

Replace `192.168.1.60` with the IP address that **Developer Mode** shows. The
installer remembers the web app for that TV, and `update` keeps it. Use
`--no-web` the same way to go back to the native app.

## Optional: install with webOS Dev Manager

[webOS Dev Manager](https://github.com/webosbrew/dev-manager-desktop) is a
free desktop app for Windows, macOS and Linux, made by the webOS Homebrew
community. It is not an LG product. Use it on Windows, where KROMA's installer
does not run. It replaces [Install KROMA](#install-kroma) and
[Update KROMA](#update-kroma) above.

You also need the KROMA file for LG, `KROMA-webos-VERSION.ipk`, from
[kroma.tv/download](https://kroma.tv/download) or from the
[releases](https://github.com/kromatv/kroma/releases).

1. Download webOS Dev Manager from its
   [releases page](https://github.com/webosbrew/dev-manager-desktop/releases)
   and open it.
2. Add your TV with the IP address and the passphrase that **Developer Mode**
   shows.
3. Open the **Apps** tab, choose to install a package, and select the `.ipk`
   file you downloaded.

KROMA appears in the TV's app list. Follow
[Connect the TV to your server](tv.md#connect-the-tv-to-your-server).

To update KROMA, install the new `.ipk` the same way. The TV keeps your server
address and your sign-in.

## Troubleshooting

### The TV does not appear in the installer

Check that **Dev Mode Status** and **Key Server** are on in the
**Developer Mode** app, and that the TV and the computer are on the same
network. If the TV still does not appear, install on it by its address:

```bash
npx @kromatv/installer install 192.168.1.60 --passphrase A1B2C3
```

Replace `192.168.1.60` with the IP address that **Developer Mode** shows, and
`A1B2C3` with its passphrase. A TV that restarted may have a new address.

### The TV refuses the passphrase

The passphrase is case-sensitive and changes when you turn Developer Mode off
and on. Copy it again from the **Developer Mode** app.

### KROMA disappeared from the TV

The Developer Mode session ran out. Turn Developer Mode on again, then install
KROMA again.
