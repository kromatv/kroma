# KROMA Privacy Policy

**Last updated: 29 July 2026**

KROMA is a client for a media server **you** run. It is not a streaming service:
we host no catalogue, we hold no account for you, and the films and series you
watch are on hardware you control. This policy describes the KROMA apps: the TV
apps for LG webOS and Samsung Tizen, the Apple TV and Android TV apps, the mobile
and desktop apps, and the web client.

## The short version

**We do not collect anything.** KROMA contains no analytics, no telemetry, no
advertising and no tracking of any kind. There is no KROMA account to create, so
there is nothing for us to hold. The app talks to the server you point it at, and
(unless you sign in) to nothing else at all.

Crash reporting is **off by default**. If you turn it on, a crash sends a stack
trace and your app build and device model to **your own KROMA server** and to
nowhere else. We never receive it: there is no KROMA-operated sink, and the
report carries nothing that identifies you beyond the device model already needed
to read your library.

## What the app connects to

**1. Your KROMA server.** The address you type on the connection screen, or one
the app finds by looking for a server on your own local network. Everything the
app shows you (your libraries, your profiles, your viewing progress) comes from
there and goes back there. That server is yours; how it handles your data is
governed by whoever operates it, which is normally you.

**2. Artwork hosts, if your server uses them.** Posters and backdrops are
addresses supplied by *your* server. If it stores absolute links to a metadata
provider (The Movie Database, for example), your device fetches those images
directly from that provider, which sees the request the same way any image
request is seen. A server that stores its artwork locally produces no such
request.

**3. GitHub, on the desktop app only.** The desktop app checks for its own
updates when it starts and every six hours after that, by fetching a release file
from GitHub. GitHub therefore sees the request's IP address and user-agent. The
TV, mobile and web clients do not do this.

The typefaces are bundled inside the app rather than fetched from a font CDN, so
a television with no route to the internet runs KROMA normally against a server
on its own network, and no third party is told that you launched it. Beyond the
update check above, the app contacts no KROMA-operated service in the course of
normal use.

## What is stored on your device

Locally, on the device itself, so the app can start where you left it:

- the addresses of servers you have added, and which one is active
- the profiles you have paired on this device, and the session token each one
  uses to talk to its server
- your language, subtitle and playback preferences
- a random identifier that lets a phone recognise this television when you cast
  to it

None of this is transmitted to us. Uninstalling the app removes all of it.

## Notifications (mobile app only)

If you enable notifications in the mobile app, it exchanges the push token issued
by Apple or Google for a **grant** at `push.kroma.tv`, a sealed capability that
names one device and can do exactly one thing: deliver a notification to it. Your
server is given the grant, never the token, so a KROMA server never learns your
device's push address, and neither the grant nor our rate-limit records can be
read back into one. This is the only KROMA-operated service any app contacts, it
is used only when you turn notifications on, and it carries no information about
what you watch. The TV apps do not use it.

## Children

KROMA ships no content of its own and offers nothing for sale. What a profile can
see is decided on your server, which supports per-profile PIN locks.

## Your rights

Your data is in two places, both of which you control: this device, and your
server. Uninstalling the app clears the first. For the second, the operator of
that server (normally you) decides what is kept and can delete it. We hold
nothing about you to disclose, correct or erase.

## Changes to this policy

Material changes will be published here with a new date above. The version in
force is the one published at the time you use the app.

## Contact

privacy@kroma.tv
