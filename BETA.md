# Joining the KROMA beta

How to install KROMA on your devices and take part in the tests.
No technical knowledge required.

## Before you start

KROMA is a player for **your own media server**. The app on its own contains no
films: you need a KROMA server reachable from the device's network. If you are
testing someone else's server, ask them for its address (something like
`http://192.168.1.50:4040`) or for a Quick Connect code.

## Which device do you want to install on?

| Device | How |
|---|---|
| iPhone, iPad | [TestFlight](#iphone-and-ipad) |
| Android phone or tablet | [Firebase](#android-phone-and-tablet) |
| Beamer, Android TV, Google TV, Fire TV, Shield | [Manual install](#beamer-and-android-tv) |
| Computer | Just open your server's address in a browser |

## iPhone and iPad

1. Install **TestFlight** from the App Store (Apple's free app).
2. Open this link on your iPhone or iPad:
   **https://testflight.apple.com/join/RvvRxgvV**
3. Tap **Accept**, then **Install**.

KROMA then appears on your home screen like any other app, and TestFlight
notifies you whenever a new version is available.

> The link goes live once Apple has approved the first beta build. If it still
> shows an error, the review is in progress: try again later.

## Android phone and tablet

1. Open this link on your phone:
   **https://appdistribution.firebase.dev/i/3aa500cefb6aeb83**
2. Enter your email address, then follow the instructions sent to you by email.
3. Install the **App Tester** app that Firebase offers, then download KROMA
   from inside it.

Android will ask you to allow installs from that source: accept. See
[Allowing unknown sources](#allowing-unknown-sources).

## Beamer and Android TV

This covers Android beamers, Android TV and Google TV sets, Fire TV devices and
Nvidia Shield boxes.

> **Important:** the Firebase App Tester app does not exist on Android TV. On a
> beamer or a TV you therefore have to install the `.apk` file by hand. The three
> methods below all do the same thing, so pick whichever suits you.

### Method 1: from your phone (easiest)

You need your Android phone and the beamer on the same Wi-Fi network.

1. On the **phone**, download the `.apk` file: open
   https://github.com/maxscharwath/kroma/releases/latest and tap the file whose
   name starts with `KROMA-androidtv`.
2. Install the free **Send Files to TV** app on both the phone **and** the
   beamer (it exists in both app stores).
3. On the **beamer**, open Send Files to TV and choose **Receive**.
4. On the **phone**, open Send Files to TV, choose **Send**, pick the `.apk`
   you downloaded, then pick the beamer.
5. On the beamer, open the received file and confirm the install.

### Method 2: directly on the beamer

1. On the beamer, install the **Downloader** app (by AFTVnews) from the app store.
2. Open Downloader and type this address into the URL field:

   ```
   https://github.com/maxscharwath/kroma/releases/latest
   ```

3. On the page that opens, scroll down to the list of files and select the one
   whose name starts with `KROMA-androidtv`.
4. The download starts, then Downloader offers to install it: confirm.

Typing an address with a remote is tedious, which is why method 1 is nicer when
you have a phone at hand.

### Method 3: with a computer

For users comfortable with a command line.

1. On the beamer: **Settings** > **System** > **About**, then press
   **Build number** **7 times** until "You are now a developer" appears.
2. Go back to **Settings** > **Developer options** and turn on **USB debugging**
   (or **Network debugging**, depending on the device).
3. Find the beamer's IP address under **Settings** > **Network**.
4. From the computer, with [adb](https://developer.android.com/tools/adb)
   installed:

   ```bash
   adb connect 192.168.1.60:5555     # replace with your beamer's IP
   adb install -r KROMA-androidtv-0.1.32.apk
   ```

   A confirmation prompt appears on the beamer: tick "Always allow" and accept.

Once installed, KROMA shows up in the beamer's app list.

## Allowing unknown sources

Android blocks apps that do not come from the store by default. During the
install, a message offers to allow whichever app is doing the installing
(browser, Downloader, file manager): accept it, then go back to finish.

The setting also lives under **Settings** > **Apps** > **Special access** >
**Install unknown apps**.

## Common problems

**"App not installed" or a signature error**
An older KROMA is already present and was signed with a different key.
Uninstall it first, then install again. From a command line:
`adb uninstall tv.kroma.androidtv`.

**The app cannot find the server**
Check that the device and the server are on the same network, and enter the
full address including the port, for example `http://192.168.1.50:4040`.
On a beamer connected to a guest Wi-Fi network, the server is usually
unreachable.

**Video stays black or stutters**
Report it with the title of the film and the device model: some codecs are not
decoded by the hardware and fall back to software decoding.

**KROMA does not appear on the beamer's home screen**
Look in the full app list. Some launchers do not add manually installed apps to
the main row automatically.

## Sending feedback

- iPhone and iPad: the **Send Feedback** button in TestFlight, or a screenshot
  taken from inside the app.
- Android: from the App Tester app.
- By email: beta@kroma.tv
- Or open an issue at https://github.com/maxscharwath/kroma/issues.

Please mention the device, the KROMA version and what you were doing when the
problem happened. Screenshots help a lot.

---

Looking to install KROMA on a Samsung or LG TV, a Synology NAS or the desktop?
See [INSTALL.md](INSTALL.md), which covers every platform in a more technical way.
