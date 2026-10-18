import { useWebRuntime } from '#web/shared/lib/web-runtime';
// Thin web wrapper over the shared `useStoryboard` hook: injects the global
// `kromaClient()` so existing callers keep the `useStoryboard(itemId, opts?)`
// signature. All logic (lazy-generation polling, fast+slow backoff, visibility
// re-check, tile math) lives in `@kromatv/ui`.

import type { ItemId } from '@kromatv/client/media';
import { useStoryboard as useSharedStoryboard } from '@kromatv/ui';

export type { Storyboard, StoryboardTile } from '@kromatv/ui';

export function useStoryboard(itemId: ItemId, opts?: { generate?: boolean }) {
  const webRuntime = useWebRuntime();

  return useSharedStoryboard(webRuntime.client, itemId, opts);
}
