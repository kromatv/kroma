# Android TV: what a held key looks like to the app

What the focus engine relies on when it reads the remote on Android TV
(`packages/ui/src/lib/focus-remote.ts`). Each fact names its source. Read
2026-11-15.

## Sources

- **T**: `react-native-tvos` 0.88.0-0, the version this repository resolves
  `react-native` to, read in `node_modules/react-native/ReactAndroid/src/main/java/com/facebook/react/`:
  `uimanager/JSKeyDispatcher.kt`, `uimanager/events/KeyEvent.kt`,
  `modules/core/ReactAndroidHWInputDeviceHelper.java`,
  `views/view/ReactViewGroup.kt`.
- **V**: AOSP `platform/frameworks/base` at `1cdfff555f4a`, Apache-2.0:
  `core/java/android/view/ViewConfiguration.java`.
- **E**: logged on an Android TV emulator (`sdk_google_atv64_arm64`, Android 16)
  running a debug build of the TV app, 2026-11-15, with the centre key held for
  2.5 s by `input keyevent --duration 2500 23`.

## A held key is more key-downs

- Android repeats a key that stays down. The first repeat comes after the key
  repeat timeout, 400 ms by default, and the next ones every 50 ms. Both are
  settings a device or a user can change (`KEY_REPEAT_TIMEOUT_MS`,
  `KEY_REPEAT_DELAY_MS`), so neither number is a constant to build on. (V:
  `DEFAULT_KEY_REPEAT_TIMEOUT_MS`, `DEFAULT_KEY_REPEAT_DELAY_MS`,
  `getKeyRepeatTimeout`, `getKeyRepeatDelay`.)
- Every `ACTION_DOWN`, the first and each repeat alike, reaches a view as
  `onKeyDown`; `ACTION_UP` reaches it once as `onKeyUp`. (T: `JSKeyDispatcher.handleKeyEvent`.)

## The event does not say it is a repeat

- The payload of `onKeyDown` and `onKeyUp` is `target`, `key`, `code`, `altKey`,
  `ctrlKey`, `metaKey`, `shiftKey` and `timestamp`. There is no `repeat`.
  (T: `KeyEvent.getEventData`.)
- So `event.nativeEvent.repeat` is always `undefined` on Android, and code that
  filters on it filters nothing. A key-down with no key-up since the last one is
  the only sign of a repeat the app gets.
- The same goes for the key-up, and for every repeat: each is sent to whichever
  view holds the focus when it happens, not to the one that was focused when
  the key went down. (T: `JSKeyDispatcher`, which keeps one `focusedViewTag` and
  reads it at dispatch.)
- Seen on a device: the first key-down carried `target: 8`, the tile under the
  focus. It opened a screen, and the repeat 468 ms later carried `target: 198`,
  a row of that new screen. Neither payload had a `repeat`. (E)
- Each screen mounts its own key host, so a repeat that lands on a new screen
  is heard by a handler that never saw the first key-down. Whatever remembers
  that a key is held has to outlive a screen. (E, and `useRemoteHostProps`.)

## The other channel: `useTVEventHandler`

- A centre-key press arrives there as `select` on key-up. Held past 300 ms it
  becomes `longSelect`: one event on a key-down, one on the key-up, and none of
  the repeats between them. (T: `ReactAndroidHWInputDeviceHelper.handleKeyEvent`,
  `mLongPressedDelta`, `shouldDispatchEvent`.)
- The engine takes the first channel that speaks and ignores the other for the
  life of the app (`createRemoteTransport`), which is why both descriptions above
  matter and only one applies on a given run.

## What went wrong before this was written down

Holding OK on a title opens its menu after 500 ms. The repeats kept arriving as
plain presses, the menu's first row took the focus, and once the 300 ms press
guard ran out the next repeat pressed that row: the film started under a
finger that had never left the key. The same hold on a tile with no menu
opened the next screen and pressed its first row. (E)
