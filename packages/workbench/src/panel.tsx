// The inspector: what a story says about itself, and what you can change.
//
// It is TABBED, the way Storybook's addons panel is, and that is a correction
// rather than a decoration. Everything used to be stacked into one scroll -
// prose, then usage, then guidelines, then the controls, then a prop table - so
// the controls, which are the only part anyone interacts with, were four sections
// down. Tabs put each answer one press away and let the count on the tab say how
// much is behind it before it is opened.
//
// The panel has two shapes, because the content is the same either way and only
// the room differs. Beside the canvas it is a column. Under the canvas it is a
// dock, and the docked one collapses to its tab row on a phone, where the canvas
// and the panel are otherwise fighting over one short column.

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
  /** A demo takes no args, so the controls would edit nothing and the prose
   *  gets the whole panel. */
  showControls: boolean;
  layout: WorkbenchLayout;
}

/** The panel's three answers. `adjust` is what you can change, `about` is what
 * the design intends, `props` is the whole surface the component declares. */
type TabId = 'adjust' | 'about' | 'props';

interface Tab {
  id: TabId;
  name: string;
  glyph: IconName;
  /** Shown beside the name when there is something to count. A tab that says
   *  `Props 14` is answering the question before it is opened. */
  count?: number;
  body: ReactNode;
}

/** A titled block inside a tab. */
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

/** The props table: name, whether it is required, its type, and what it is FOR.
 * Read out of the component source rather than declared anywhere; see props.ts.
 * Ruled between rows, because a table of fourteen props with no rules is a wall
 * of monospace and the eye loses which sentence belongs to which name. */
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

/** Which tabs this story has anything to put in. A tab with an empty body is
 * worse than a missing one: it promises an answer and then has none. */
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
  // The tab you were reading, kept across stories: someone comparing two
  // components' props tables should not be sent back to the controls between
  // them. A story without that tab falls back to its first, which is why this is
  // a preference rather than the truth.
  const [wanted, setWanted] = useState<TabId>('adjust');
  const active = tabs.find((tab) => tab.id === wanted) ?? tabs[0];

  // On a phone the dock and the canvas are fighting over one short column, and
  // the component is what you came for: the dock collapses to its tab row until
  // asked. Wider than that, there is room for both and it simply stays open.
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
      {/* The tab row is also the panel's titlebar: it is what says the panel is a
          tool rather than leftover page. It holds TABS and nothing else. `Reset`
          used to sit at its right end, which was wrong twice over: the inspector
          column is 320pt at its narrowest and three tabs plus a labelled button
          do not fit in it, so the button was drawn over the last tab - and the
          button was on screen while the props table was open, where it acts on
          something that is not being looked at. It now lives at the head of the
          controls themselves, which is the only tab it means anything in. */}
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
            // Rendered here rather than inside `tabsFor` so the controls read the
            // CURRENT args: building them with the tab list would capture the args
            // of whichever render first opened the panel.
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

/** One tab. Underlined when active, the way a document's tabs are: exactly one
 * is ever the one being read. */
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
      {/* Truncates rather than pushing the tab beside it off the row: the panel
          is 320pt wide at its narrowest and the dock is as narrow as the phone
          it is on, and a clipped name still reads where an overlapped one does
          not. The glyph and the count never shrink - they are the two parts that
          answer at a glance. */}
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

/** The grip that opens the dock where it collapses. A chevron and nothing else:
 * the tabs beside it already name what is inside. */
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
// Two points taller than the kit button's square, which is the box the old
// padded grip came to: the tab row beside it sets the height being filled.
const HANDLE = { height: 37 } as const;
// The shared tab shape plus this row's own layout: an icon, a label and a count
// side by side. `minWidth: 0` is what lets the label inside actually truncate -
// without it a flex item refuses to shrink below its content and the row spills
// instead.
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
