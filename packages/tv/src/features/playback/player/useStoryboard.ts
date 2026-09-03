// Thin TV wrapper: all the logic lives in `@kroma/ui`.

import type { KromaClient } from '@kroma/client';
import type { ItemId } from '@kroma/client/media';
import { useStoryboard as useSharedStoryboard } from '@kroma/ui';

export type { Storyboard, StoryboardTile } from '@kroma/ui';

export function useStoryboard(client: KromaClient, itemId: ItemId) {
  return useSharedStoryboard(client, itemId);
}
