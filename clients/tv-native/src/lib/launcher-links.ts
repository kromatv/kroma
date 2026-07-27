// A launcher row the user selected -> the app's detail screen.
//
// Every program KROMA publishes to the Android TV home carries
// `kroma://item/<id>` as its intent (see the tv-launcher module's WatchNext.kt
// and HomeChannel.kt). Selecting one launches or re-targets the app with that
// URL, which reaches JavaScript through React Native's `Linking` - something no
// code inside @kroma/tv can subscribe to. So the shell parses it and pushes the
// result in through `requestDeepLink`, exactly the way `siri-search` pushes a
// spoken query through `requestSearch`.
//
// Both arrival times are covered, because the launcher does not care whether the
// app was running: a tile that cold-started it is waiting in `getInitialURL`,
// and one selected while it was open arrives as a `url` event.
//
// Two link forms, one per catalogue: `kroma://item/<id>` resolves in the movie
// catalogue (the common continue-watching case), and `kroma://show/<id>` in the
// shows - what a launcher publishes for an EPISODE, whose own id the movie
// lookup cannot resolve (the publishers put the showId in the link; see the
// Top Shelf ContentProvider.swift and WatchNext.kt). `TvApp` looks the id up
// and simply does not navigate if it matches nothing, so a stale id costs a
// no-op rather than a wrong screen.
//
// This is also how the path is exercised without a launcher at all:
//
//   xcrun simctl openurl <udid> 'kroma://item/abc123'
//   adb shell am start -a android.intent.action.VIEW -d 'kroma://show/abc123'

import { requestDeepLink } from '@kroma/tv';
import { Linking } from 'react-native';

type LauncherLink = { type: 'movie' | 'show'; id: string };

/** The deep link in a `kroma://item/<id>` / `kroma://show/<id>` URL, if that is
 * what this URL is. Hand-parsed rather than through `URL`, which React Native
 * only partly implements (mirrors `siri-search`'s searchInUrl). */
export function linkInUrl(url: string | null): LauncherLink | null {
  if (!url) return null;
  const [, kind, raw] = /^kroma:\/\/(item|show)\/([^/?#]+)/i.exec(url) ?? [];
  if (!kind || !raw) return null;
  const type = kind.toLowerCase() === 'show' ? 'show' : 'movie';
  let id = raw;
  try {
    id = decodeURIComponent(raw) || raw;
  } catch {
    /* keep the raw id */
  }
  return { type, id };
}

/** Start forwarding launcher selections to the app. Returns a cleanup function. */
export function startLauncherLinks(): () => void {
  void Linking.getInitialURL().then((url) => {
    const link = linkInUrl(url);
    if (link) requestDeepLink(link);
  });

  const sub = Linking.addEventListener('url', ({ url }) => {
    const link = linkInUrl(url);
    if (link) requestDeepLink(link);
  });
  return () => sub.remove();
}
