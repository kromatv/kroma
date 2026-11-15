# @kromatv/installer

Install [KROMA](https://kroma.tv) on the TVs on your network, from a Mac or a
Linux computer:

```bash
npx @kromatv/installer
```

The command asks which version of KROMA and which kind of TV you have: Samsung,
LG or Android TV. It shows what to do once on the TV, then finds those TVs on
your network. It downloads the KROMA app for each one from the
[latest release](https://github.com/kromatv/kroma/releases/latest), and
installs it on the TVs you tick.

To update KROMA later, on every TV you installed it on:

```bash
npx @kromatv/installer update
```

The installer keeps the list of those TVs, so this command asks nothing.

## Which KROMA app it installs

On a Samsung TV from 2021 or later and on an LG TV from 2018 or later, the
installer puts the native KROMA app: a `.tpk` on Samsung, an `.ipk` on LG. It
runs on the TV directly, with no browser.

A Samsung TV from 2017 to 2020 cannot run the native app. On those TVs, the
installer puts the web app, a `.wgt`, and says why.

To install the web app on any Samsung or LG TV, install by the address of the
TV with `--web`: `npx @kromatv/installer install TV_ADDRESS --web`. The
installer remembers it for that TV, and `update` keeps it. To go back to the
native app, use `--no-web` the same way.

## Before you begin

- [Node.js](https://nodejs.org) 22 or later, on macOS or Linux.
- The computer and the TV on the same network.
- One step on the TV itself. It is done once, and no tool can do it over the
  network:

| TV | What to do once | Guide |
| --- | --- | --- |
| Samsung | Turn on developer mode. The first install opens Samsung's sign-in in your browser, to get the certificate of the TV | [Samsung TV](https://kroma.tv/docs/samsung-tv) |
| LG | Install the Dev Mode app, turn on Dev Mode and its key server | [LG TV](https://kroma.tv/docs/lg-tv) |
| Android TV, Google TV | Turn on network debugging in the developer options | [Android TV](https://kroma.tv/docs/android-tv) |
| Apple TV | Nothing to do here: KROMA for Apple TV comes from TestFlight | [Apple TV](https://kroma.tv/docs/apple-tv) |

## What it puts on your computer

- For a Samsung TV, no tool. On the first install, the installer asks Samsung
  for the certificate of your TV, once you sign in to your Samsung account. It
  keeps the certificate in `~/.kroma/certificates/samsung`, signs the app with
  it and sends it to the TV itself. Tizen Studio is not needed.
- For an LG TV, no tool. On the first install, the installer asks for the
  passphrase that the Dev Mode app shows, and gets the key of your TV with it.
  It keeps the key in `~/.kroma/keys/webos`, readable by you alone, and sends
  the app to the TV itself. LG's command-line tools are not needed.
- For an Android TV, no tool: the installer talks to the TV itself. It keeps
  the key the TV is asked to trust in `~/.kroma/adb`.
- The KROMA apps it downloads, in `~/.kroma/downloads`. Each download is
  checked against the SHA-256 that the release lists.
- The list of the TVs it installed KROMA on, in `~/.kroma/televisions.json`:
  the address of each TV and what was installed on it. `update` reads this
  list.

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

The app must be signed with a certificate that Samsung issued for that TV. The
installer gets one on the first install. To get one again, run
`npx @kromatv/installer certificate TV_ADDRESS`, where `TV_ADDRESS` is the
address of the TV, and sign in to your Samsung account when the browser opens.

### `Author certificate not match`

A KROMA signed with another certificate is already on the TV. Delete it: in
**Apps**, hold the select button on the KROMA tile, then choose **Delete**.
Install again.

### A Samsung TV from 2020 or earlier refuses the app

The installer could not find the year of the TV, so it sent the native app,
which these TVs cannot run. Install again with `--web`.

### An LG TV refuses the key

The TV no longer takes the key the installer kept from an earlier install.
Turn on **Key Server** in the Dev Mode app, then install again with
`--passphrase` and the passphrase that the app shows now. The installer gets
the key again.

### `GitHub did not list the stable release`

The computer has no connection to GitHub, or it has used the 60 requests that
GitHub allows each hour without an account. Wait, or download the app from
[kroma.tv/download](https://kroma.tv/download) and pass it with `--package`.

More answers are in the
[package notes](https://github.com/kromatv/kroma/tree/main/packages/installer#when-it-goes-wrong).
