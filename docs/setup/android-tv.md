# Install KROMA on Android TV, Google TV and Fire TV

This guide covers every TV and box that runs Android: Google TV and Android TV
sets from Sony, TCL, Philips and others, the Chromecast with Google TV, the
Google TV Streamer, the NVIDIA Shield, Amazon Fire TV with Fire OS, and
projectors that run Android.

There are two ways to install KROMA:

- **From Google Play**, as a beta tester. Updates arrive on their own. This
  needs Google Play on the TV.
- **From the `.apk` file**, on devices without Google Play, such as a Fire TV
  or many projectors. The Downloader app installs it from the TV, and KROMA's
  installer from a computer. You install each update yourself.

## Install from Google Play

KROMA is in a closed test on Google Play, so it does not appear in a search.
Join the test from a phone or a computer, with the Google account that the TV
uses.

1. Join the tester group:
   [groups.google.com/g/kroma-android-beta](https://groups.google.com/g/kroma-android-beta).
2. Open the test page and select **Become a tester**:
   [play.google.com/apps/testing/tv.kroma.app](https://play.google.com/apps/testing/tv.kroma.app).
3. Open KROMA on Google Play in a browser:
   [play.google.com/store/apps/details?id=tv.kroma.app](https://play.google.com/store/apps/details?id=tv.kroma.app).
4. Select **Install**, choose your TV in the device list, and select
   **Install** again.

The TV downloads KROMA in the next minutes. It appears with your other apps.
Google says the test page can take a few hours to work after you join the
group.

## Install without Google Play

The file is `KROMA-androidtv-VERSION.apk`, on
[kroma.tv/download](https://kroma.tv/download) and on the
[releases page](https://github.com/kromatv/kroma/releases/latest).

### With the Downloader app

This needs nothing but the TV.

1. On the TV, install **Downloader** by AFTVnews from the app store.
2. Allow Downloader to install apps:
   - On Google TV and Android TV: **Settings** > **Apps** >
     **Security & restrictions** > **Unknown sources**, then turn on
     **Downloader**.
   - On Fire TV: **Settings** > **My Fire TV** > **Developer Options** >
     **Install unknown apps**, then turn on **Downloader**.
3. Open Downloader and enter this address:

   ```
   https://github.com/kromatv/kroma/releases/latest
   ```

4. Scroll to the list of files and select the one that starts with
   `KROMA-androidtv`.
5. When the download ends, select **Install**.

KROMA appears in the full list of apps. Some home screens do not add sideloaded
apps to their main row on their own.

### From a computer

KROMA's installer finds the TV on your network and installs KROMA on it. It
works when the TV has **Wireless debugging**, **Network debugging** or
**USB debugging**. Which one a TV has depends on its brand and its Android
version. Android 13 and later, which includes the Chromecast with Google TV
since its 2025 update and the Google TV Streamer, may offer only
**Wireless debugging**.

You need a Mac or a Linux computer on the same network as the TV, with
[Node.js](https://nodejs.org) 22 or later. `node --version` prints the
version. The installer does not run on Windows.

1. On the TV, open **Settings** > **System** > **About**, select
   **Android TV OS build** seven times, until the TV says that you are a
   developer.
2. Go back to **Settings** > **System** > **Developer options** and turn on
   **Wireless debugging**, **Network debugging** or **USB debugging**,
   depending on the TV.
3. In a terminal on your computer, start the installer:

   ```bash
   npx @kromatv/installer
   ```

   The first time, `npx` asks to download the installer. Type `y`, then press
   Enter. The installer asks its questions in English. Use the arrow keys to
   move and Enter to answer.

4. At **Which version of KROMA?**, choose **Stable**.
5. At **Which kind of TV?**, choose **Android TV**.
6. At **Which TVs get KROMA?**, wait for your TV to appear.

   A TV with debugging on shows **ready** and is already ticked. Press Space
   to tick or untick a TV.

7. Press Enter to install.

   The installer talks to the TV by itself. Nothing else is installed on your
   computer.

8. If the installer asks for a pairing code, the TV uses
   **Wireless debugging**. On the TV, open **Settings** > **System** >
   **Developer options** > **Wireless debugging**, and select
   **Pair device with pairing code**. Type the six digits that the TV shows
   in the terminal, then press Enter.

   The installer pairs your computer with the TV. It asks for no code again
   while the TV remembers this computer.

9. If the TV shows a prompt to allow this computer, accept it and tick
   **Always allow**.

   The installer downloads the latest KROMA for Android TV, installs it on the
   TV and starts it.

If the TV does not appear in the list, install on it by its address:

```bash
npx @kromatv/installer install 192.168.1.61
```

Replace `192.168.1.61` with the address of your TV.

If that TV uses **Wireless debugging** and was never paired with your
computer, open **Pair device with pairing code** on the TV first, and give the
code it shows:

```bash
npx @kromatv/installer install 192.168.1.61 --pairing-code 123456
```

Replace `123456` with the six digits on the TV.

## Amazon Fire TV

Fire TV sticks and Fire TV smart TVs that run **Fire OS** install KROMA with
the Downloader app, as above. Downloader is in the Amazon Appstore.

The Fire TV Stick 4K Select (2025), the Fire TV Stick HD (2026) and the Fire TV
Stick 4K 3rd generation (2026) run **Vega OS** and cannot install Android apps
at all. In **Settings** > **My Fire TV** > **About**, a Fire OS device shows
**Fire OS**.

If **Developer Options** is missing on a Fire TV, open **Settings** >
**My Fire TV** > **About** and select the device name seven times.

## Update KROMA

From Google Play, updates install on their own. If you installed KROMA with
KROMA's installer, update it on every TV that this computer installed it on:

```bash
npx @kromatv/installer update
```

Otherwise, install the new `.apk` the same way as the first time. The TV keeps
your server address and your sign-in.

## Troubleshooting

### `App not installed`, or `INSTALL_FAILED_UPDATE_INCOMPATIBLE`

A KROMA signed with another key is already installed, for example the Google
Play version when you install the `.apk`, or the other way round. Uninstall it,
then install again. With adb:

```bash
adb uninstall tv.kroma.app
```

### Two KROMA apps on the TV

Before version 0.2, the Android TV app had another ID, `tv.kroma.tv` or
`tv.kroma.androidtv`. The new app installs beside it. Connect the new one to
your server, then uninstall the old one.

### adb shows the TV as `unauthorized`

The TV is waiting for you to accept the computer. Accept the prompt on the TV,
tick **Always allow**, then run the command or the installer again.

### The installer says that the TV shows no pairing code

The TV listens for the code only while the **Pair device with pairing code**
window is open. Open it again, leave it on the screen, and type the code it
shows now.

### The installer says that the TV refused the pairing code

The code changes each time the **Pair device with pairing code** window opens.
Type the six digits that are on the screen now.

### `This app has been blocked`

Since 2025, Amazon blocks some sideloaded apps on Fire TV. If a Fire TV blocks
KROMA, use the Google Play version on a Google TV device instead, and
[open an issue](https://github.com/kromatv/kroma/issues) so we know.
