// `?shot`: one story alone on the page, which is what the screenshot runner
// opens - and, with no story named, the list of ids it walks.

import { Box, Text } from '@kroma/ui/kit';
import type { ColorToken } from '@kroma/ui/tokens';
import type { ReactNode } from 'react';
import type { StoryEntry } from './entry';
import type { Story } from './story';
import { stageWidth } from './viewport';

const SHOT_PAD = 32;

interface Shot {
  listOnly: boolean;
  stories: readonly StoryEntry[];
  story: Story | undefined;
  body: ReactNode;
  surface: ColorToken;
  width: number;
}

/** The whole page under `?shot`. Blank while the named story's module is still
 * being fetched: a runner waits for the picture, and half a picture is worse
 * than none. */
function shotStage(at: Shot): ReactNode {
  if (at.listOnly) {
    return <Text>{`KROMA_STORY_IDS:${at.stories.map((entry) => entry.id).join(',')}`}</Text>;
  }
  if (!at.story) return null;
  // A story that declares a width measures itself and has to be given one;
  // measured against the window, because a shot has no stage card.
  const stage = stageWidth(at.story.width, at.width - SHOT_PAD * 2);
  return (
    <Box flex bg={at.surface} p={SHOT_PAD} align="flex-start" justify="flex-start">
      <Box w={stage.width}>{at.body}</Box>
    </Box>
  );
}

export { shotStage };
