# @kromatv/installer

Install [KROMA](https://kroma.tv) on the TVs on your network, from a Mac or a
Linux computer:

```bash
npx @kromatv/installer
```

The command finds the Samsung, LG and Android TV sets on your network, downloads
the KROMA app for each one from the
[latest release](https://github.com/kromatv/kroma/releases/latest), and installs
it on the sets you choose. Run it again to update KROMA.

## Before you begin

- [Node.js](https://nodejs.org) 22 or later, on macOS or Linux.
- The computer and the TV on the same network.
- One step on the TV itself. It is done once, and no tool can do it over the
  network:

| TV | What to do once | Guide |
| --- | --- | --- |
| Samsung | Turn on developer mode, then get its certificate: `npx @kromatv/installer certificate TV_ADDRESS`, and sign in to Samsung | [Samsung TV](https://kroma.tv/docs/samsung-tv) |
| LG | Install the Dev Mode app, turn on Dev Mode and its key server | [LG TV](https://kroma.tv/docs/lg-tv) |
| Android TV, Google TV | Turn on network debugging in the developer options | [Android TV](https://kroma.tv/docs/android-tv) |
| Apple TV | Nothing to do here: KROMA for Apple TV comes from TestFlight | [Apple TV](https://kroma.tv/docs/apple-tv) |

## What it puts on your computer

- For a Samsung TV, no tool. The installer asks Samsung for the certificate of
  your TV, keeps it in `~/.kroma/certificates/samsung`, signs the app with it
  and sends it to the TV itself. Tizen Studio is not needed.
- For an LG TV, LG's command-line tools, installed with npm into
  `~/.kroma/tools`.
- For an Android TV, Google's `adb`, downloaded into `~/.kroma/tools`. An
  Android SDK you already have is used instead.
- The KROMA apps it downloads, in `~/.kroma/downloads`. Each download is
  checked against the SHA-256 that the release lists.

## Commands

<!-- usage:start -->

<!-- usage:end -->

`--source canary` installs the newest development build instead of the latest
release.

## Troubleshooting

### The scan finds no TV

On macOS, the terminal needs the **Local Network** permission: **System
Settings** > **Privacy & Security** > **Local Network**. Without it, every
connection fails and the scan finds nothing.

A TV also stays hidden until its one-time step is done: an LG without the Dev
Mode app running and an Android TV without network debugging do not answer.

### A Samsung TV refuses the certificate

The app must be signed with a certificate that Samsung issued for that TV. Get
one with `npx @kromatv/installer certificate TV_ADDRESS`, where `TV_ADDRESS` is
the address of the TV, and sign in to your Samsung account when the browser
opens.

### `Author certificate not match`

A KROMA signed with another certificate is already on the TV. Delete it: in
**Apps**, hold the select button on the KROMA tile, then choose **Delete**.
Install again.

### `GitHub did not list the stable release`

The computer has no connection to GitHub, or it has used the 60 requests that
GitHub allows each hour without an account. Wait, or download the app from
[kroma.tv/download](https://kroma.tv/download) and pass it with `--package`.

More answers are in the
[package notes](https://github.com/kromatv/kroma/tree/main/packages/tv-installer#when-it-goes-wrong).
