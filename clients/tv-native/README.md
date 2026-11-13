# tv-native

The Apple TV / Android TV / Samsung Tizen / LG webOS shell. It is platform glue: the
10-foot experience itself lives in [`@kromatv/tv`](../../packages/tv).

Every TV platform is set up by one entry in `app.json`, the config plugin of
[`@kromatv/react-native-tv`](https://github.com/kromatv/react-native-tv/tree/main/packages/react-native-tv).
It hands `@react-native-tvos/config-tv` the `tvos` block for Apple TV and
Android TV, gives each TV platform package among the dependencies the shared
props and its own block (`tizen`, `webos`), and teaches Metro their platforms,
so `metro.config.ts` names no TV. A third TV is then one more dependency.

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
bunx rn-tizen simulator run --instance <name>   # the aarch64 simulator
```

Use `bunx`, not `npx`: npm resolves `rn-tizen` from the workspace root, where
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
bunx rn-webos simulator run --instance <name>   # the aarch64 simulator
bunx rn-webos package                           # webos/<id>_<version>_arm.ipk
```

No local module has a webOS implementation yet: `server-discovery` finds
nothing on an LG set, so a server is added by its address there.

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
