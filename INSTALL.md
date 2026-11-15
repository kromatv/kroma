# Installing KROMA

The installation guides are in [docs/setup](docs/setup/README.md), and on
[kroma.tv/docs](https://kroma.tv/docs).

Install the server:

- [Docker](docs/setup/docker.md)
- [Synology NAS](docs/setup/synology.md)
- [QNAP, Unraid and TrueNAS](docs/setup/other-nas.md)
- [Media folders and permissions](docs/setup/media-folders.md)
- [First run](docs/setup/first-run.md)

Install the apps:

- [Samsung TV](docs/setup/samsung-tv.md)
- [LG TV](docs/setup/lg-tv.md)
- [Android TV, Google TV and Fire TV](docs/setup/android-tv.md)
- [Apple TV](docs/setup/apple-tv.md)
- [Phones and tablets](docs/setup/mobile.md)
- [Computers](docs/setup/desktop.md)

## Builds that are not released yet

Every push to `main` builds the apps and the server. To install a build that
has no release yet, run the **Build & Release** workflow by hand, or download
the artifacts of a finished run:

```bash
gh workflow run "Build & Release" -f targets=tv   # or all, desktop, spk
gh run watch
gh run download -n kroma-tizen-tpk                 # or kroma-webos-native-ipk, kroma-androidtv-apk
```

`kroma-tizen-tpk` and `kroma-webos-native-ipk` are the native Samsung and LG
apps. `kroma-tizen-wgt` is the Samsung web app, for TVs from 2017 to 2020, and
`kroma-webos-ipk` the LG web app.

GitHub wraps each artifact in a ZIP file, and keeps it for 90 days. The
artifacts of the **CI** workflow are web bundles for debugging, not packages
you can install.
