import type { Release, ReleasesView } from '@kromatv/client/releases';

type WhatsNewStep = { kind: 'show'; index: number } | { kind: 'close' };

/** The release What's new opens on: the one the reader has not been shown, else
 * the running version's, else the newest. */
export function whatsNewRelease(view: ReleasesView): Release | null {
  const wanted = view.unseen ?? view.current;
  return view.releases.find((release) => release.version === wanted) ?? view.releases[0] ?? null;
}

export function nextStep(index: number, count: number): WhatsNewStep {
  return index + 1 < count ? { kind: 'show', index: index + 1 } : { kind: 'close' };
}
