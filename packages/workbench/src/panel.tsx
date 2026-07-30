// The inspector: what a story says about itself, and what you can change. It is a
// column beside the canvas, or a dock under it that collapses to its tab row.

import { Box, Focusable, Icon, IconButton, type IconName, Txt } from '@kroma/ui/kit';
import { colors } from '@kroma/ui/tokens';
import { type ReactNode, useState } from 'react';
import { ScrollView } from 'react-native';
import { FOCUS_WASH, RULE, RULE_TOP, TAB, TAB_ACTIVE } from './chrome';
import { CodeBlock, MONO } from './code';
import { Controls } from './controls';
import { Guidelines, RichText } from './docs';
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
      <Txt variant="overline" color="accent">
        {title}
      </Txt>
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
            <Txt variant="meta" style={PROP_NAME}>
              {prop.name}
            </Txt>
            {prop.optional ? null : (
              <Txt variant="meta" color="danger" style={PROP_REQUIRED}>
                required
              </Txt>
            )}
            <Txt variant="meta" color="textDim" style={PROP_TYPE} lines={1}>
              {prop.type}
            </Txt>
          </Box>
          {prop.docs ? (
            <RichText variant="meta" color="textMuted">
              {prop.docs}
            </RichText>
          ) : null}
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
              <RichText variant="meta" color="textMuted">
                {story.docs}
              </RichText>
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
      style={docked ? RULE_TOP : SIDE}
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
        <ScrollView style={SCROLL} contentContainerStyle={docked ? DOCK_BODY : SIDE_BODY}>
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
              <Txt variant="meta" color="textDim">
                This story has nothing to adjust.
              </Txt>
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
    <Focusable
      label={tab.name}
      ring={false}
      onPress={onPress}
      style={[TAB, TAB_ROW, active && TAB_ACTIVE]}
      focusedStyle={FOCUS_WASH}
    >
      <Icon name={tab.glyph} size={14} color={active ? 'accent' : 'textDim'} />
      <Txt variant="meta" color={active ? 'text' : 'textDim'} lines={1} style={TAB_INK}>
        {tab.name}
      </Txt>
      {tab.count === undefined ? null : (
        <Box px={5} shrink={0} radius="pill" bg={active ? 'accentSoft' : 'surface2'}>
          <Txt variant="meta" color={active ? 'accent' : 'textDim'} style={BADGE}>
            {tab.count}
          </Txt>
        </Box>
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
      focusedStyle={FOCUS_WASH}
      style={HANDLE}
      onPress={onPress}
    >
      <Icon name={open ? 'chevron-down' : 'chevron-up'} size={15} color="textMuted" />
    </IconButton>
  );
}

const SCROLL = { flex: 1 } as const;
const SIDE = { borderLeftWidth: 1, borderLeftColor: colors.border } as const;
const SIDE_BODY = { padding: 16, paddingBottom: 56 } as const;
const DOCK_BODY = { paddingHorizontal: 20, paddingVertical: 18, paddingBottom: 32 } as const;
// Fills the height of the tab row beside it.
const HANDLE = { height: 37 } as const;
// `minWidth: 0` is what lets the label truncate; without it a flex item refuses to
// shrink below its content and the row spills.
const TAB_ROW = {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 7,
  flexShrink: 1,
  minWidth: 0,
} as const;
const TAB_INK = { fontSize: 12.5, fontWeight: '600', flexShrink: 1 } as const;
const BADGE = { fontSize: 10.5, fontFamily: MONO, lineHeight: 16 } as const;

export type { PanelProps, TabId };
export { Panel, tabsFor };

const PROP_NAME = { fontFamily: MONO, fontSize: 12.5, fontWeight: '700' } as const;
const PROP_TYPE = { fontFamily: MONO, fontSize: 11.5, flexShrink: 1 } as const;
const PROP_REQUIRED = { fontSize: 10, letterSpacing: 0.3, textTransform: 'uppercase' } as const;
