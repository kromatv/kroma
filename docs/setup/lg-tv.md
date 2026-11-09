# Install KROMA on an LG TV

An LG TV installs apps from outside its store through LG's **Developer Mode**
app, sent from a computer on the same network. This guide turns Developer Mode
on and installs KROMA, in about 15 minutes.

One KROMA file works on every LG TV with webOS 4.0 or later, which means sets
from 2018 onward. Sets from 2016 and 2017 cannot run it.

## Before you begin

- An LG TV from 2018 or later.
- A Mac, Windows or Linux computer on the same network as the TV.
- A free LG developer account. Create it on
  [webostv.developer.lge.com](https://webostv.developer.lge.com) with
  **Sign In** > **Create Account**.
- The KROMA file for LG, `tv.kroma.webos_VERSION_all.ipk`, from
  [kroma.tv/download](https://kroma.tv/download) or from the
  [releases](https://github.com/kromatv/kroma/releases).

## Turn on Developer Mode on the TV

1. On the TV, open the app store, called **Apps** or **LG Content Store**
   depending on the year. Search for **Developer Mode** and install it.
2. Open **Developer Mode** and sign in with your LG developer account.
3. Switch **Dev Mode Status** to **On**. The TV restarts.
4. Open **Developer Mode** again and switch **Key Server** to **On**.

The app now shows the TV's IP address and a six-character passphrase. Keep it
open: you need both in the next step.

## Install KROMA

Choose one of the two ways below. The first needs no command line.

### With webOS Dev Manager

[webOS Dev Manager](https://github.com/webosbrew/dev-manager-desktop) is a
free desktop app for Windows, macOS and Linux, made by the webOS Homebrew
community. It is not an LG product.

1. Download it from its
   [releases page](https://github.com/webosbrew/dev-manager-desktop/releases)
   and open it.
2. Add your TV with the IP address and the passphrase that **Developer Mode**
   shows.
3. Open the **Apps** tab, choose to install a package, and select the `.ipk`
   file you downloaded.

### With LG's command-line tools

1. Install the webOS CLI. It needs [Node.js](https://nodejs.org) 20 or later:

   ```bash
   npm install -g @webos-tools/cli
   ```

2. Register the TV:

   ```bash
   ares-setup-device --add tv -i "host=192.168.1.60" -i "port=9922" -i "username=prisoner"
   ```

   Replace `192.168.1.60` with the IP address that **Developer Mode** shows.

3. Get the TV's key. Enter the passphrase when asked:

   ```bash
   ares-novacom --device tv --getkey
   ```

4. Install and start KROMA:

   ```bash
   ares-install --device tv tv.kroma.webos_*_all.ipk
   ares-launch --device tv tv.kroma.webos
   ```

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

Install the new `.ipk` the same way. The TV keeps your server address and your
sign-in.

## Troubleshooting

### The computer cannot reach the TV

Check that **Key Server** is on in the **Developer Mode** app, and that the
address you entered is the one the app shows now. A TV that restarted may have
a new address.

### `ares-novacom` asks for a passphrase it refuses

The passphrase is case-sensitive and changes when you turn Developer Mode off
and on. Copy it again from the **Developer Mode** app.

### KROMA disappeared from the TV

The Developer Mode session ran out. Turn Developer Mode on again, then install
KROMA again.
