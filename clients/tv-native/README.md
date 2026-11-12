# tv-native

The Apple TV / Android TV / Samsung Tizen / LG webOS shell. It is platform glue: the
10-foot experience itself lives in [`@kromatv/tv`](../../packages/tv).

## Samsung Tizen

Tizen runs this same app through
[`@kromatv/react-native-tizen`](https://github.com/kromatv/react-native-tizen),
which reads its config plugin's props in `app.json` and the Metro config's
`withTizen`. From this directory:

```bash
bunx expo start                                 # then shift+m, Run on TV
bunx rn-tizen simulator run --instance <name>   # the aarch64 simulator
bunx rn-tizen run --device <tv-ip>              # a TV in Developer Mode
```

Use `bunx`, not `npx`: npm resolves `rn-tizen` from the workspace root, where
bun does not link it.

A local module carries its Tizen implementation in its own `tizen/` folder,
declared in its `expo-module.config.json`; `server-discovery` is one.

## LG webOS

webOS runs this same app through
[`@kromatv/react-native-webos`](https://github.com/kromatv/react-native-webos),
which reads its config plugin's props in `app.json` and the Metro config's
`withWebOS`. From this directory:

```bash
bunx rn-webos simulator run --instance <name>   # the aarch64 simulator
bunx rn-webos package                           # webos/<id>_<version>_arm.ipk
bunx rn-webos run --device <tv-ip>              # a TV in Developer Mode
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
