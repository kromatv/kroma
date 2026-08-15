// The canvas while a story's module is still on its way.
//
// The chrome the index already knows about is drawn straight away - the
// toolbar, the section, the name - so arriving at a component does not blank the
// column and then rebuild it. Only the stage waits, and it waits at the same
// height the real one occupies: a busy mark centred in a `flex` box, never a
// wrapper that collapses to nothing and reads as a component drawn black.

import { Box, Spinner } from '@kroma/ui/kit';
import type { StoryEntry } from './entry';
import type { WorkbenchLayout } from './layout';
import { StageToolbar, type StageView, StoryHeading } from './story-view';
import type { ToolbarLens } from './toolbar';

interface StoryPendingProps {
  entry: StoryEntry;
  stage: StageView;
  lenses?: readonly ToolbarLens[];
  layout: WorkbenchLayout;
  /** Opens the component list; set only while the tree is a drawer. */
  onMenu?: () => void;
}

function StoryPending({ entry, stage, lenses, layout, onMenu }: Readonly<StoryPendingProps>) {
  return (
    <Box flex minW={0} minH={0}>
      <StageToolbar stage={stage} lenses={lenses} onMenu={onMenu} layout={layout} />
      <StoryHeading name={entry.name} group={entry.group} layout={layout} />
      <Box flex minH={0} align="center" justify="center" p={layout.stagePad}>
        <Spinner label={`Loading ${entry.name}`} />
      </Box>
    </Box>
  );
}

export { StoryPending };
