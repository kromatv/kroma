# tv-native

The Apple TV / Android TV / Samsung Tizen / LG webOS shell. It is platform glue: the
10-foot experience itself lives in [`@kromatv/tv`](../../packages/tv).

Every TV comes from one dependency,
[`@kromatv/react-native-tv`](https://github.com/kromatv/react-native-tv/tree/main/packages/react-native-tv),
and one entry in `app.json`, its config plugin. The package brings the Samsung
and LG packages and `@react-native-tvos/config-tv`, so `package.json` lists
none of them. The entry hands `config-tv` the `tvos` block for Apple TV and
Android TV, gives each TV platform the shared props and its own block (`tizen`,
`webos`), and teaches Metro their platforms, so `metro.config.ts` names no TV.

What only one platform has is imported under its name, as in
`@kromatv/react-native-tv/tizen/preview`, and a platform's own command line is
`rn-tv <platform>`: `bunx rn-tv tizen doctor`.

The same package adds `run:tizen` and `run:webos` to Expo CLI, through the
patch in `patches/@expo%2Fcli@<version>.patch`. After an Expo upgrade that
changes `@expo/cli`, run `bunx rn-tv expo-patch` here and commit what it names.

## Samsung Tizen

Tizen runs this same app through
[`@kromatv/react-native-tizen`](https://github.com/kromatv/react-native-tv/tree/main/packages/react-native-tizen),
which reads the shared props and the `tizen` block in `app.json`. From this
directory:

```bash
bunx expo start                                 # then t, or shift+t to pick a TV
bunx expo run:tizen --device <tv-ip>            # a TV in Developer Mode
bunx rn-tv tizen simulator run --instance <name>   # the aarch64 simulator
bunx rn-tv tizen package                           # tizen/bin/Release/tizen80/<id>-<version>.tpk
```

Use `bunx`, not `npx`: npm resolves `rn-tv` from the workspace root, where
bun does not link it.

A local module carries its Tizen implementation in its own `tizen/` folder,
declared in its `expo-module.config.json`; `server-discovery` is one.

Voice search on Tizen is `expo-speech-recognition`, which react-native-tizen
implements on the TV's speech engine, with the Smart Remote's mic button held
through `MicButton` (`src/lib/voice-search.tizen.tsx`). Hold the button
anywhere in the app: search opens listening, and letting go searches what was
heard. The package is left out of autolinking on Android and Apple, where the
local `voice-search` module and Siri do the same job.

## LG webOS

webOS runs this same app through
[`@kromatv/react-native-webos`](https://github.com/kromatv/react-native-tv/tree/main/packages/react-native-webos),
which reads the shared props and the `webos` block in `app.json`. From this
directory:

```bash
bunx expo run:webos --device <tv-ip>            # a TV in Developer Mode
bunx rn-tv webos simulator run --instance <name>   # the aarch64 simulator
bunx rn-tv webos package                           # webos/<id>_<version>_arm.ipk
```

No local module has a webOS implementation yet: `server-discovery` finds
nothing on an LG set, so a server is added by its address there.

## Release builds

Every push to `main` builds both TV packages here, in the `tizen-native` and
`webos-native` jobs of `.github/workflows/_release-tv.yml`, on a stock Ubuntu
runner:

| Package | Command | Release file | Runs on |
| --- | --- | --- | --- |
| Samsung | `bunx rn-tv tizen package --arch armv7l --platform 6.0` | `KROMA-tizen-<v>.tpk` | Tizen 6.0 (2021) and later |
| LG | `bunx rn-tv webos package` | `KROMA-webos-<v>.ipk` | webOS 4 (2018) and later |

`KROMA_VERSION` is the release triplet, so both manifests carry a plain
`x.y.z`. Neither job installs Tizen Studio or an LG tool. The Samsung build
reads two Tizen packages, the IoT Headed 6.0 armv7 rootstrap and the GCC 14.2
runtime, fetched by checksum and unpacked into `$TIZEN_SDK_DIR`. It signs with
a self-signed author certificate made for the run: a retail set takes only
Samsung's certificates for itself, so `@kromatv/installer` signs the package
again for each TV.

Samsung's sets before 2021 refuse a native library, so they keep the web app
of [`clients/tizen`](../tizen). The installer sends them the `.wgt` by itself.

## Testing the voice and launcher doors

Siri does not exist in the tvOS simulator, so `kroma://search?q=...` is the only
way to exercise the search path (native bridge -> `requestSearch` -> the search
screen) anywhere but on a real Apple TV with a real remote:

```bash
xcrun simctl openurl <udid> 'kroma://search?q=blade%20runner'
```

Launcher tiles arrive the same way, on `kroma://item/<id>` for a movie and
`kroma://show/<id>` for an episode:

```bash
xcrun simctl openurl <udid> 'kroma://item/<id>'
```

Both doors have to work cold and warm: a tile or phrase that launched the app is
waiting in `getInitialURL`, and one used while it was already open arrives as a
`url` event.
