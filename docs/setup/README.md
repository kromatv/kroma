# Set up KROMA

KROMA has two parts: a server that holds your films and series, and the apps
that play them. You install the server once, on a machine that stays on. Then
you install an app on each screen you watch on.

Setting it up takes three steps:

1. [Install the server](#install-the-server) on your NAS or on a computer.
2. [Create your account and add your media](first-run.md) from a web browser.
3. [Install the apps](#install-the-apps) on your TV, phone and computer.

## Install the server

Pick the guide for the machine that holds your films:

| Your machine | Guide |
| --- | --- |
| Synology NAS with an Intel or AMD processor | [Synology](synology.md) |
| Synology NAS with an ARM processor | [Synology, with Container Manager](synology.md#install-with-container-manager) |
| QNAP, Unraid or TrueNAS | [Other NAS](other-nas.md) |
| Linux computer or Raspberry Pi 4 or 5 | [Docker](docker.md) |
| Mac or Windows computer | [Docker](docker.md), with Docker Desktop |

The server runs on any 64-bit x86 or ARM processor. It needs:

- a folder for its own data, which grows with the size of your library;
- read access to your media folders, and write access if KROMA will download
  or rename files for you (see [Media folders and permissions](media-folders.md));
- a place on your home network that your TV and phone can reach, on port
  `4040`.

The server sends a file unchanged when the screen can play it, which is most of
the time, so it needs little processing power. When a screen cannot play a
file, the server converts it while you watch. On a NAS, that is where
[hardware transcoding](hardware-transcoding.md) makes the difference.

## Install the apps

KROMA is not in the app stores yet. Phones and some TVs install it through a
beta program. Samsung and LG TVs need a computer once, to put the app on the TV.

| Screen | Guide | How it installs today |
| --- | --- | --- |
| Samsung TV | [Samsung TV](samsung-tv.md) | from a computer, after turning on developer mode |
| LG TV | [LG TV](lg-tv.md) | from a computer, with LG's Developer Mode app |
| Android TV, Google TV, NVIDIA Shield | [Android TV](android-tv.md) | Google Play beta, or an `.apk` file |
| Amazon Fire TV, projectors without Google Play | [Android TV](android-tv.md#install-without-google-play) | an `.apk` file |
| Apple TV | [Apple TV](apple-tv.md) | TestFlight |
| iPhone, iPad, Android phone or tablet | [Phones and tablets](mobile.md) | TestFlight, or the Google Play beta |
| Mac, Windows, Linux, Steam Deck | [Computers](desktop.md) | an installer |
| Any web browser | nothing to install | open `http://SERVER_IP:4040` |

Each app looks for the server on your network when it starts. If it does not
find it, type the server's address, for example `http://192.168.1.50:4040`.
To sign in on a TV, approve it from your phone or enter the four-digit code it
shows. [TVs](tv.md) explains both.

## All guides

Install the server:

- [Docker](docker.md)
- [Synology NAS](synology.md)
- [QNAP, Unraid and TrueNAS](other-nas.md)
- [Media folders and permissions](media-folders.md)
- [First run: your account and your libraries](first-run.md)

Install the apps:

- [TVs: which app, and how to sign in](tv.md)
- [Samsung TV](samsung-tv.md)
- [LG TV](lg-tv.md)
- [Android TV, Google TV and Fire TV](android-tv.md)
- [Apple TV](apple-tv.md)
- [Phones and tablets](mobile.md)
- [Computers](desktop.md)

Run the server:

- [Hardware transcoding](hardware-transcoding.md)
- [HTTPS, reverse proxies and remote access](network.md)
- [Sign in with your identity provider](single-sign-on.md)
- [Updates and backups](updates.md)
- [Configuration reference](configuration.md)
- [Troubleshooting](troubleshooting.md)

If none of these answers your question, search the
[issues](https://github.com/kromatv/kroma/issues) or open a new one.
