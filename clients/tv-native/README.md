# tv-native

The Apple TV / Android TV shell. It is platform glue: the 10-foot experience
itself lives in [`@kroma/tv`](../../packages/tv).

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
