# Bringing a television back

Casting needs KROMA open on the television. This is how a television that is
off, or showing something else, is listed anyway and brought back: the app
opened and the title started, from any sender.

## What is kept

A receiver says what it knows about reaching itself in its `cast.hello` and in
`/cast/announce` (`wake`: hardware address, address on the network, app id).
When the television reached the server without leaving its network, the
address its request came from is kept in place of the one it gave.

One row per receiver is kept in `cast_devices`, for the account it is signed
into. A television whose "allow control from another device" setting is off
has the server drop its row, so it is listed nowhere, on or off. `GET /cast/receivers` lists the live receivers, then the kept ones that
are not live, marked `asleep`. Nothing in a row is trusted on the way in or on
the way out: a hardware address must be a real one, an address a private IPv4,
an app id safe inside a URL.

## The server reaches no television

The server may be anywhere: in the house, or on a machine in another country.
So it never talks to a television. It keeps what the television said, and
`POST /cast/receivers/:id/wake` answers with the steps as data and holds a
`play` for 120 seconds, handed over the moment that receiver arrives.

The sender runs the steps, because the sender is the one on the television's
network. `runWakeSteps` in `@kromatv/core` makes one pass over them, and the
shared cast session in `@kromatv/ui` repeats the pass every 2.5 seconds until
the television arrives or 90 seconds have passed.

What a platform can do is one port, `WakeReach`, with three means:

| platform | `http` | `open` (a WebSocket) | `magic` |
| --- | --- | --- | --- |
| browser | yes | its own: it refuses a certificate the set signed for itself | no: a page has no datagram |
| iPhone, iPad | yes | accepts the set's own certificate (`@kromatv/lan-reach`) | yes, with Apple's multicast entitlement on a real device |
| Android | yes | accepts the set's own certificate (`@kromatv/lan-reach`) | yes |
| desktop | yes | its own | not written yet |

A platform gives the means and never the protocol. How each make of television
is spoken to is written once, in `packages/core/src/cast/wake`, on top of the
port: `samsung.ts`, `lg.ts`, and the two steps that need no conversation in
`steps.ts`. The native socket opens only to a private or link-local IPv4
address written in digits, so the certificate it accepts is always a
television's on this network.

`keys` on the port is where what a television gave when a person accepted this
device on its screen is kept, by the television's address: the keychain on a
phone, `localStorage` in a browser.

A step that needs what the platform lacks, or a television that waits for a
person, ends as `needsPower`: the row says that the television has to be
switched on with its remote, and the session keeps watching, so the app is
opened as soon as the set is on. A pass ends before the next one is timed, so a
set that shows a prompt shows it once.

A make is one row in `DRIVERS` (`kroma-domain/src/cast_wake.rs`) and one step
in `runWakeStep`. A platform with no row gets the Wake-on-LAN step.

| platform | step | what the sender does |
| --- | --- | --- |
| `Tizen` | `samsung` | power key in standby, the packet when silent, then the launch |
| `webOS` | `lg` | the packet when silent; when on, pairs once and launches the app |
| `AppleTV` | `knock` | one request to the AirPlay port (7000) |
| `AndroidTV` | `manual` | nothing: a person switches it on |

## Samsung

Measured on a 2024 Frame (Tizen 8), not read off a document:

- **Standby keeps the network on.** `GET :8001/api/v2/` still answers, with
  `PowerState: "standby"`. A Wake-on-LAN packet did not wake it. The power key
  sent to the remote service (`wss://<tv>:8002/api/v2/channels/samsung.remote.control`)
  did, in about five seconds.
- **The remote service wants a token.** The first connection shows a prompt on
  the television, and the welcome frame carries the token. Port 8001 without
  TLS answers `ms.channel.unauthorized`. A browser is refused the connection on
  8002 outright, because of the certificate.
- **The HTTP service answers a browser.** A page read `GET :8001/api/v2/` and
  sent the launch, both across origins, with no prompt.
- **The app is opened by `POST :8001/api/v2/applications/<appId>`**, with no
  token. It answers only for an id of the form `Package.Name` whose package id
  has no dot: `KromaTV001.KROMA` is found, `tv.kroma.app` is 404, and so is
  `tv.kroma.app.KROMA`. `ed.apps.launch` on the remote service and DIAL on port
  8080 open nothing.
- **A Frame showing art reports that it is on**, and the launch opens the app
  from there. That is the state a Frame is in after it is switched off, so a
  browser brings it back with the launch alone.

## LG

From LG's own Connect SDK and the libraries built on it, not measured: no LG
set was at hand.

- The control service is a WebSocket on port 3001 with a certificate the set
  signed for itself; older sets answer on the plain port 3000 alone. The
  encrypted port is tried first.
- `register` with a manifest that asks for `LAUNCH` makes the set show a prompt
  the first time, then answer `registered` with a `client-key`. Sent back, the
  key is accepted at once.
- `ssap://system.launcher/launch` with the app id opens the app.
- The set wakes for the packet when its own "turn on by network" setting is on.
- The webOS app is a browser and reads neither address. Its JS service reads
  both from Node (`network-service.ts`).

## Apple TV

Not measured either. tvOS gives an app no hardware address, so there is no
packet. An Apple TV wakes when a request is made to it, which is Apple's
design, so the step is one request to its AirPlay port. It comes back on the
app it showed before it slept: a set that slept on another app has to be
brought to KROMA by a person. Nothing short of Apple's Companion protocol,
with its pairing, opens an app.

## Android TV

Android gives an app no hardware address since Android 11, and Google's remote
service (ports 6466 and 6467) wants a certificate exchanged with the set and a
code typed first. Neither is written, so the set is listed, the sender says to
switch it on, and the held `play` starts when the app opens.

## What is not there yet

- LG, Apple TV and Android TV were written from documents and never run
  against a set.
- A Samsung set in full power-off (the power key held down) refuses its remote
  service with `ms.channel.timeOut` and ignores the packet on Wi-Fi. Measured.
  The sender then says to switch it on.
- A television in true standby is not switched on from a browser, which has
  neither the remote service nor a datagram. The iOS and Android apps have
  both (`packages/lan-reach`); the desktop half is not written.
- Neither native half is proven inside the app. The Swift code and the Kotlin
  code each pressed keys on the television from a Mac, and the iOS app builds
  and links its half. The iOS simulator on the machine they were written on
  crashes in its own loader before any app code runs, and that machine has no
  Android SDK, so the Android module was never built by Gradle.
- The native Tizen package is `tv.kroma.app`, which the application service
  does not answer for. It needs an id of the form above before a native build
  can be opened; the web build already has one.
- The Android TV app reports its app id only. The Apple TV app reports its
  address as well; neither can read a hardware address.
- A page served over HTTPS asks the television over HTTP, which a browser
  allows only with its local-network permission.
- A television that signs out stays listed until it is forgotten
  (`DELETE /cast/receivers/:id/wake`).
