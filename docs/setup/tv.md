# Install KROMA on a TV

KROMA is not in the TV app stores yet, so how you install it depends on your
TV. This page tells you which guide to follow, and how a TV finds your server
and signs in once the app is installed.

## Find your TV

| Your TV or box | Guide | What you need |
| --- | --- | --- |
| Samsung, 2017 or later | [Samsung TV](samsung-tv.md) | a computer, a free Samsung account, about 30 minutes the first time |
| LG, webOS 4.0 (2018) or later | [LG TV](lg-tv.md) | a computer, a free LG developer account |
| Android TV, Google TV, NVIDIA Shield, Philips, Sony, TCL | [Android TV](android-tv.md) | a Google account, or the `.apk` file |
| Amazon Fire TV with Fire OS | [Android TV: Fire TV](android-tv.md#amazon-fire-tv) | the Downloader app |
| Apple TV | [Apple TV](apple-tv.md) | an iPhone or iPad, and TestFlight |

Some TVs cannot run KROMA: LG sets from 2016 and 2017 (webOS 3), Philips sets
that run Saphi or Titan OS, and the newest Fire TV sticks, which run Vega OS
instead of Fire OS. On those, use a streaming box such as a Google TV, an
Apple TV or a Fire TV with Fire OS, or open KROMA in the TV's web browser.

## Connect the TV to your server

When KROMA starts on a TV for the first time, it looks for your server:

1. It searches your home network for a KROMA server on port `4040`. If it finds
   one, it connects without asking.
2. If it finds none, it shows **Add a server**. Type the server's address with
   the remote, for example `192.168.1.50:4040`, then select **Connect**.

The search fails when the TV and the server are on different networks, such as
a guest Wi-Fi, or when the server uses another port than `4040`. Type the
address in both cases.

## Sign in on the TV

Typing a password with a remote is slow, so the TV asks another device to sign
it in. The TV shows two ways:

- **From your phone, on the same network.** Open KROMA on your phone, signed
  in. It lists the TVs that are waiting nearby. Tap yours and approve.
- **With a code, from anywhere.** The TV shows a four-digit code and a QR code.
  On a phone or computer that is signed in to KROMA, select
  **Connect a device** in the menu, enter the code, and select **Authorize**.
  This works across networks, even from a phone on mobile data. Scanning the
  QR code with a phone's camera opens the same page in its browser, as long as
  the phone can reach the server's address.

The TV then shows the profiles of your account. A profile with a PIN asks for
it.

> [!TIP]
> To sign a TV in to someone else's account, they approve it from their own
> phone, or enter the code while signed in to their own account.

## Next steps

- [Troubleshooting](troubleshooting.md#a-tv-or-app-does-not-find-the-server)
  if a TV cannot find or reach the server.
- [Hardware transcoding](hardware-transcoding.md) if a film plays on your
  phone but not on your TV.
