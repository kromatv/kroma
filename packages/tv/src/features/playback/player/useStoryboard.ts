// Thin TV wrapper: all the logic lives in `@kroma/ui`.

import type { KromaClient } from '@kroma/core';
import { useStoryboard as useSharedStoryboard } from '@kroma/ui';

export type { Storyboard, StoryboardTile } from '@kroma/ui';

export function useStoryboard(client: KromaClient, itemId: string) {
  return useSharedStoryboard(client, itemId);
}
