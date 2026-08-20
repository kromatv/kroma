// Launcher tiles arrive as `kroma://item/<id>` or `kroma://show/<id>` through
// React Native's `Linking`, which no code inside @kroma/tv can subscribe to.
// A launcher publishes the SHOW id for an episode, never the episode's own.

import { requestDeepLink } from '@kroma/tv';
import { Linking } from 'react-native';

type LauncherLink = { type: 'movie' | 'show'; id: string };

// Hand-parsed rather than through `URL`, which React Native only partly implements.
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

export function startLauncherLinks(): () => void {
  void Linking.getInitialURL()
    .then((url) => {
      const link = linkInUrl(url);
      if (link) requestDeepLink(link);
    })
    .catch(() => undefined);

  const sub = Linking.addEventListener('url', ({ url }) => {
    const link = linkInUrl(url);
    if (link) requestDeepLink(link);
  });
  return () => sub.remove();
}
