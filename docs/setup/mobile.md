# Install KROMA on a phone or tablet

KROMA for iPhone, iPad and Android is a beta. iPhone and iPad install it with
TestFlight, Apple's app for testing apps. Android installs it from Google Play
as a tester, or from the `.apk` file.

## iPhone and iPad

You need iOS or iPadOS 16 or later.

1. Install [TestFlight](https://apps.apple.com/app/testflight/id899247664) from
   the App Store.
2. Open this link on the iPhone or iPad:
   [testflight.apple.com/join/ZjgQdunW](https://testflight.apple.com/join/ZjgQdunW).
3. Select **Accept**, then **Install**.

KROMA appears on the home screen. TestFlight tells you when a new version is
ready. A beta version stops working 90 days after it was published, so keep it
updated.

The same beta gives you KROMA on your Apple TV. See [Apple TV](apple-tv.md).

## Android phone and tablet

### From Google Play

KROMA is in a closed test, so it does not appear in a search.

1. Join the tester group with your Google account:
   [groups.google.com/g/kroma-android-beta](https://groups.google.com/g/kroma-android-beta).
2. Open the test page and select **Become a tester**:
   [play.google.com/apps/testing/tv.kroma.app](https://play.google.com/apps/testing/tv.kroma.app).
3. Install KROMA from Google Play:
   [play.google.com/store/apps/details?id=tv.kroma.app](https://play.google.com/store/apps/details?id=tv.kroma.app).

Google Play installs each new version. The test page can take a few hours to
work after you join the group.

### From the `.apk` file

1. On the phone, open the
   [releases page](https://github.com/kromatv/kroma/releases/latest) and
   download the file that starts with `KROMA-mobile` and ends with `.apk`.
2. Open the downloaded file.
3. If Android asks, allow your browser to install apps, then go back and
   select **Install**.

With the `.apk`, you install each update yourself. The Google Play version and
the `.apk` cannot replace each other: uninstall one before you install the
other.

## Connect to your server

1. Open KROMA. On your home network, it finds the server on its own. If it
   does not, enter the server's address, for example `http://192.168.1.50:4040`.
2. Sign in with your account, or with the invitation link the owner sent you.

Away from home, the app reaches the server only if the server is reachable from
the internet. See [HTTPS, reverse proxies and remote access](network.md).

## Next steps

- Sign in a TV from your phone: [TVs](tv.md#sign-in-on-the-tv).
- [Troubleshooting](troubleshooting.md#a-tv-or-app-does-not-find-the-server).
