// The inspector: what a story says about itself, and what you can change. It is a
// column beside the canvas, or a dock under it that collapses to its tab row.

import { Box, Focusable, Icon, IconButton, type IconName, styles, sv, Text } from '@kroma/ui/kit';
import { type ReactNode, useState } from 'react';
import { ScrollView } from 'react-native';
import { RULE, RULE_TOP, TAB } from './chrome';
import { CodeBlock, MONO } from './code';
import { Controls } from './controls';
import { Guidelines, RichText, StoryProse } from './docs';
import type { WorkbenchLayout } from './layout';
import type { PropDoc } from './props';
import type { Story } from './story';

interface PanelProps {
  story: Story;
  args: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  onReset: () => void;
  showControls: boolean;
  layout: WorkbenchLayout;
}

type TabId = 'adjust' | 'about' | 'props';

interface Tab {
  id: TabId;
  name: string;
  glyph: IconName;
  count?: number;
  body: ReactNode;
}

function Section({ title, children }: Readonly<{ title: string; children: ReactNode }>) {
  return (
    <Box gap={10}>
      <Text variant="overline" color="accent">
        {title}
      </Text>
      {children}
    </Box>
  );
}

function PropTable({ props }: Readonly<{ props: readonly PropDoc[] }>) {
  return (
    <Box>
      {props.map((prop, at) => (
        <Box
          key={prop.name}
          gap={3}
          pt={at === 0 ? 0 : 12}
          pb={12}
          style={at === props.length - 1 ? undefined : RULE}
        >
          <Box row align="baseline" gap={8} wrap>
            <Text variant="meta" style={s.propName}>
              {prop.name}
            </Text>
            {prop.optional ? null : (
              <Text variant="meta" color="danger" style={s.propRequired}>
                required
              </Text>
            )}
            <Text variant="meta" color="textDim" style={s.propType} lines={1}>
              {prop.type}
            </Text>
          </Box>
          {prop.docs ? <RichText>{prop.docs}</RichText> : null}
        </Box>
      ))}
    </Box>
  );
}

/** Only the tabs this story has something to put in; an empty tab is omitted. */
function tabsFor(story: Story, showControls: boolean): Tab[] {
  const tabs: Tab[] = [];
  const guided = story.guidelines.do.length > 0 || story.guidelines.dont.length > 0;

  if (showControls && story.controls.length > 0) {
    tabs.push({
      id: 'adjust',
      name: 'Controls',
      glyph: 'adjustments-horizontal',
      count: story.controls.length,
      body: null,
    });
  }
  if (story.docs || story.usage || guided) {
    tabs.push({
      id: 'about',
      name: 'Docs',
      glyph: 'file-text',
      body: (
        <Box gap={24}>
          {story.docs ? (
            <Section title="What it's for">
              <StoryProse docs={story.docs} />
            </Section>
          ) : null}
          {story.usage ? (
            <Section title="Usage">
              <CodeBlock code={story.usage} />
            </Section>
          ) : null}
          {guided ? (
            <Section title="Guidelines">
              <Guidelines rules={story.guidelines} />
            </Section>
          ) : null}
        </Box>
      ),
    });
  }
  if (story.props.length > 0) {
    tabs.push({
      id: 'props',
      name: 'Props',
      glyph: 'braces',
      count: story.props.length,
      body: <PropTable props={story.props} />,
    });
  }
  return tabs;
}

function Panel({ story, args, onChange, onReset, showControls, layout }: Readonly<PanelProps>) {
  const docked = layout.panel === 'below';
  const tabs = tabsFor(story, showControls);
  // A preference, not the truth: the tab persists across stories, and a story
  // without it falls back to its first.
  const [wanted, setWanted] = useState<TabId>('adjust');
  const active = tabs.find((tab) => tab.id === wanted) ?? tabs[0];

  const collapsible = docked && layout.mode === 'compact';
  const [open, setOpen] = useState(false);
  const shown = !collapsible || open;
  const resettable = showControls && story.controls.length > 0;

  return (
    <Box
      bg="surface1"
      shrink={0}
      w={docked ? undefined : layout.panelWidth}
      h={docked && shown ? layout.panelHeight : undefined}
      style={docked ? RULE_TOP : s.side}
    >
      <Box row align="center" style={RULE}>
        {collapsible ? <Handle open={shown} onPress={() => setOpen((prev) => !prev)} /> : null}
        {tabs.map((tab) => (
          <TabButton
            key={tab.id}
            tab={tab}
            active={tab.id === active?.id && shown}
            onPress={() => {
              setWanted(tab.id);
              setOpen(true);
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
              onReset={resettable ? onReset : undefined}
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
      size={35}
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
  badge: { fontSize: 10.5, fontFamily: MONO, lineHeight: 16 },
  propName: { fontFamily: MONO, fontSize: 12.5, fontWeight: '700' },
  propType: { fontFamily: MONO, fontSize: 11.5, shrink: 1 },
  propRequired: { fontSize: 10, letterSpacing: 0.3, textTransform: 'uppercase' },
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

export type { PanelProps, TabId };
export { Panel, tabsFor };
