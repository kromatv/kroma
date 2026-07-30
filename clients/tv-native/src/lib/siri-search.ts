// Siri -> the app's search screen.
//
// Apple TV has no microphone an app may open, so Siri IS the voice input here:
// the user holds the remote's Siri button and says "cherche Blade Runner dans
// KROMA", the system resolves it against the app (KromaMediaIntents, in the
// local siri-search module) and the spoken title arrives here.
//
// Both arrival times are covered, because Siri does not care whether the app was
// running: a request that launched the app is waiting as a pending query, and
// one spoken while it was open comes in as an event.
//
// The same door also opens for `kroma://search?q=...`. That is not decoration:
// Siri does not exist in the tvOS simulator, so a URL is the only way to
// exercise this whole path (native bridge -> requestSearch -> the search screen)
// anywhere but on a real Apple TV with a real remote:
//
//   xcrun simctl openurl <udid> 'kroma://search?q=blade%20runner'

import { requestSearch } from '@kroma/tv';
import { Linking } from 'react-native';
import { SiriSearch } from '../../modules/siri-search';

// Hand-parsed rather than through `URL`, which React Native only partly implements.
function searchInUrl(url: string | null): string | null {
  if (!url) return null;
  const query = /^kroma:\/\/search\/?\?(.*)$/i.exec(url)?.[1];
  if (!query) return null;
  for (const pair of query.split('&')) {
    const [key, value = ''] = pair.split('=');
    if (key !== 'q') continue;
    try {
      return decodeURIComponent(value.replaceAll('+', ' '));
    } catch {
      return value;
    }
  }
  return null;
}

/** Start forwarding Siri's media requests (and search links) to the app.
 * Returns a cleanup function. */
export function startSiriSearch(): () => void {
  // Whatever was asked for before JavaScript existed: Siri launches the app to
  // handle an intent, and a link launches it the same way.
  const pending = SiriSearch?.takePendingQuery();
  if (pending) requestSearch(pending);
  void Linking.getInitialURL().then((url) => {
    const q = searchInUrl(url);
    if (q) requestSearch(q);
  });

  const subs = [
    SiriSearch?.addListener('query', ({ text }) => requestSearch(text)),
    Linking.addEventListener('url', ({ url }) => {
      const q = searchInUrl(url);
      if (q) requestSearch(q);
    }),
  ];
  return () => {
    for (const sub of subs) sub?.remove();
  };
}

export { searchInUrl as parseSearchUrl };
