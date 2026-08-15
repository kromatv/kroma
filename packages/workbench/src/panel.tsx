// The inspector: what a story says about itself, and what you can change. It is a
// column beside the canvas, or a dock under it that collapses to its tab row.

import {
  Box,
  Focusable,
  Icon,
  IconButton,
  type IconName,
  styles,
  sv,
  Text,
  useResizablePanel,
} from '@kroma/ui/kit';
import { type ReactNode, useState } from 'react';
import { ScrollView } from 'react-native';
import { RULE, RULE_TOP, TAB } from './chrome';
import { Controls } from './controls';
import { Interactions } from './interactions';
import type { WorkbenchLayout } from './layout';
import type { PlayRunner } from './play';
import { PropTable } from './prop-table';
import { propCount } from './props';
import type { Story } from './story';

interface PanelProps {
  story: Story;
  args: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  onReset: () => void;
  showControls: boolean;
  showReset: boolean;
  run: PlayRunner;
  layout: WorkbenchLayout;
}

type TabId = 'adjust' | 'play' | 'props';

interface Tab {
  id: TabId;
  name: string;
  glyph: IconName;
  count?: number;
  body: ReactNode;
}

/** Only the tabs this story has something to put in; an empty tab is omitted.
 * The prose is not one of them: a story's document reads on the canvas, at
 * full measure. */
function tabsFor(story: Story, showControls: boolean, run: PlayRunner): Tab[] {
  const tabs: Tab[] = [];

  if (showControls && story.controls.length > 0) {
    tabs.push({
      id: 'adjust',
      name: 'Controls',
      glyph: 'adjustments-horizontal',
      count: story.controls.length,
      body: null,
    });
  }
  if (run.playable) {
    tabs.push({
      id: 'play',
      name: 'Interactions',
      glyph: 'player-play',
      count: run.steps.length,
      body: (
        <Interactions
          steps={run.steps}
          status={run.status}
          error={run.error}
          onReplay={run.replay}
        />
      ),
    });
  }
  if (story.props.length > 0) {
    tabs.push({
      id: 'props',
      name: 'Props',
      glyph: 'braces',
      count: propCount(story.props),
      body: <PropTable name={story.name} sections={story.props} />,
    });
  }
  return tabs;
}

function Panel({
  story,
  args,
  onChange,
  onReset,
  showControls,
  showReset,
  run,
  layout,
}: Readonly<PanelProps>) {
  const docked = layout.panel === 'below';
  const tabs = tabsFor(story, showControls, run);
  // A preference, not the truth: the tab persists across stories, and a story
  // without it falls back to its first.
  const [wanted, setWanted] = useState<TabId>('adjust');
  const active = tabs.find((tab) => tab.id === wanted) ?? tabs[0];

  // The region owns the height on a phone, where the dock shuts to its tab row:
  // the seam above it and the chevron in it are two ways to say the same thing.
  const region = useResizablePanel();
  const collapsible = docked && layout.mode === 'compact';
  const shown = !collapsible || !region.collapsed;

  return (
    <Box flex minH={0} bg="surface1" style={docked ? RULE_TOP : s.side}>
      <Box row align="center" shrink={0} style={RULE}>
        {collapsible ? (
          <Handle open={shown} onPress={() => (shown ? region.collapse() : region.expand())} />
        ) : null}
        {tabs.map((tab) => (
          <TabButton
            key={tab.id}
            tab={tab}
            active={tab.id === active?.id && shown}
            onPress={() => {
              setWanted(tab.id);
              region.expand();
            }}
          />
        ))}
      </Box>
      {shown ? (
        <ScrollView style={s.scroll} contentContainerStyle={docked ? s.dockBody : s.sideBody}>
          {active?.id === 'adjust' ? (
            // Rendered here rather than inside `tabsFor`, which would capture the
            // args of whichever render first opened the panel.
            <Controls
              controls={story.controls}
              args={args}
              onChange={onChange}
              onReset={showReset ? onReset : undefined}
            />
          ) : (
            (active?.body ?? (
              <Text variant="meta" color="textDim">
                This story has nothing to adjust.
              </Text>
            ))
          )}
        </ScrollView>
      ) : null}
    </Box>
  );
}

function TabButton({
  tab,
  active,
  onPress,
}: Readonly<{ tab: Tab; active: boolean; onPress: () => void }>) {
  return (
    <Focusable label={tab.name} ring={false} onPress={onPress} sv={tabButton} vars={{ active }}>
      {({ slots }) => (
        <>
          <Icon name={tab.glyph} size={14} color={active ? 'accent' : 'textDim'} />
          <Text variant="meta" lines={1} style={slots.label}>
            {tab.name}
          </Text>
          {tab.count === undefined ? null : (
            <Box px={5} shrink={0} radius="pill" bg={active ? 'accentSoft' : 'surface2'}>
              <Text variant="meta" color={active ? 'accent' : 'textDim'} style={s.badge}>
                {tab.count}
              </Text>
            </Box>
          )}
        </>
      )}
    </Focusable>
  );
}

function Handle({ open, onPress }: Readonly<{ open: boolean; onPress: () => void }>) {
  return (
    <IconButton
      variant="ghost"
      diameter={35}
      radius={0}
      label={open ? 'Hide the inspector' : 'Show the inspector'}
      ring={false}
      focusScale={1}
      style={s.handle}
      onPress={onPress}
    >
      <Icon name={open ? 'chevron-down' : 'chevron-up'} size={15} color="textMuted" />
    </IconButton>
  );
}

const s = styles({
  scroll: { flex: true },
  side: { borderLeftWidth: 1, borderLeftColor: 'border' },
  sideBody: { p: 16, pb: 56 },
  dockBody: { px: 20, py: 18, pb: 32 },
  // Fills the height of the tab row beside it.
  handle: { h: 37 },
  badge: { fontSize: 10.5, font: 'mono', lineHeight: 16 },
});
// `minW: 0` is what lets the label truncate; without it a flex item refuses to
// shrink below its content and the row spills.
const tabButton = sv({
  slots: {
    root: {
      ...TAB,
      row: true,
      align: 'center',
      gap: 7,
      shrink: 1,
      minW: 0,
      _focus: { bg: 'white/6' },
    },
    label: { fontSize: 12.5, fontWeight: '600', shrink: 1, color: 'textDim' },
  },
  variants: {
    active: {
      true: { root: { borderBottomColor: 'accent' }, label: { color: 'text' } },
    },
  },
  defaults: { active: false },
});

export { Panel };
