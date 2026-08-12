// The open story's history, over the canvas: when it was written, when it last
// moved, and the commits behind that. It sits beside the source link because
// the two answer the same question - where this component came from.

import { Box, Icon, IconButton, styles, Text } from '@kroma/ui/kit';
import type { ReactNode } from 'react';
import { ScrollView } from 'react-native';
import { useEscapeKey } from './command';
import { HistoryBlock } from './history-view';
import { useStoryHistory } from './source';

interface StoryHistoryProps {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
}

/** The toolbar's history button and the panel it opens. Renders nothing where
 * the build read no history at all - off a checkout, or on Metro. */
function StoryHistory({ open, onOpen, onClose }: Readonly<StoryHistoryProps>) {
  const provenance = useStoryHistory();
  if (!provenance?.entry) return null;
  return (
    <Box>
      <IconButton
        variant="ghost"
        size={32}
        radius="sm"
        active={open}
        label="When this component was written and last changed"
        ring={false}
        focusScale={1}
        onPress={onOpen}
      >
        <Icon name="history" size={16} color={open ? 'accent' : 'textMuted'} />
      </IconButton>
      {open ? (
        <Panel onClose={onClose}>
          <HistoryBlock entry={provenance.entry} repository={provenance.repository} limit={4} />
        </Panel>
      ) : null}
    </Box>
  );
}

function Panel({ onClose, children }: Readonly<{ onClose: () => void; children: ReactNode }>) {
  useEscapeKey(onClose);
  return (
    <Box absolute top="100%" right={0} mt={6} w={344} z={2} style={s.panel} bg="surface2">
      <Box px={12} pt={11} pb={9}>
        <Text variant="overline" color="accent">
          History
        </Text>
      </Box>
      <ScrollView style={s.scroll} contentContainerStyle={s.body}>
        {children}
      </ScrollView>
    </Box>
  );
}

const s = styles({
  panel: { border: 'borderStrong', borderWidth: 1, radius: 'md', shadow: 'pop' },
  scroll: { grow: 0, shrink: 1, maxH: 420 },
  body: { px: 12, pb: 12 },
});

export type { StoryHistoryProps };
export { StoryHistory };
