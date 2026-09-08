// Thin TV wrapper: all the logic lives in `@kromatv/ui`.

import type { KromaClient } from '@kromatv/client';
import type { ItemId } from '@kromatv/client/media';
import { useStoryboard as useSharedStoryboard } from '@kromatv/ui';

export type { Storyboard, StoryboardTile } from '@kromatv/ui';

export function useStoryboard(client: KromaClient, itemId: ItemId) {
  return useSharedStoryboard(client, itemId);
}
