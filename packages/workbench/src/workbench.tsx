import {
  Box,
  configureRemote,
  Focusable,
  FocusScope,
  setTheme,
  styles,
  sv,
  Text,
} from '@kroma/ui/kit';
import type { ColorToken } from '@kroma/ui/tokens';
import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView } from 'react-native';
import { Matrix, stageWidth, ViewportFrame, type ViewportName } from './canvas';
import { RULE, RULE_TOP, TAB } from './chrome';
import { CodeBlock } from './code';
import { CommandPalette, useCommandKey } from './command';
import { RichText, snippet } from './docs';
import { useLayout, type WorkbenchLayout } from './layout';
import { Panel } from './panel';
import { pathRouter, type View, type WorkbenchRouter } from './router';
import { Sidebar } from './sidebar';
import type { Story } from './story';
import { PREVIEW_THEMES } from './themes';
import { Toolbar, type ToolbarLens } from './toolbar';

interface WorkbenchProps {
  stories: readonly Story[];
  brand?: ReactNode;
  title?: string;
  footer?: ReactNode;
  lenses?: readonly ToolbarLens[];
  /** Defaults to the `?story=&view=` contract, degrading to memory off the web. */
  router?: WorkbenchRouter;
}

function Workbench(props: Readonly<WorkbenchProps>) {
  // In render rather than at module load or in an effect: a module-scope call
  // would reconfigure the host app's navigator on mere import, and an effect
  // runs after the children that subscribe to the remote.
  useState(configureRemote);
  return (
    <FocusScope>
      <WorkbenchShell {...props} />
    </FocusScope>
  );
}

function shotStage(at: {
  listOnly: boolean;
  stories: readonly Story[];
  story: Story;
  body: ReactNode;
  surface: ColorToken;
  width: number;
}): ReactNode {
  if (at.listOnly) {
    return <Text>{`KROMA_STORY_IDS:${at.stories.map((entry) => entry.id).join(',')}`}</Text>;
  }
  // A story that declares a width measures itself and has to be given one;
  // measured against the window, because a shot has no stage card.
  const stage = stageWidth(at.story.width, at.width - SHOT_PAD * 2);
  return (
    <Box flex bg={at.surface} p={SHOT_PAD} align="flex-start" justify="flex-start">
      <Box w={stage.width}>{at.body}</Box>
    </Box>
  );
}

function useStageView(story: Story | undefined) {
  const [viewport, setViewport] = useState<ViewportName>('fit');
  const [rotate, setRotate] = useState(false);
  const [surface, setSurface] = useState<ColorToken>('bg');
  const [full, setFull] = useState(false);
  const [theme, setThemeId] = useState('kroma');

  // The state change is also the re-render that makes every style re-resolve.
  const pickTheme = useCallback((next: string) => {
    const chosen = PREVIEW_THEMES.find((candidate) => candidate.id === next);
    if (!chosen) return;
    setTheme(chosen.theme);
    setThemeId(chosen.id);
  }, []);

  // An effect rather than derived state so switching frame by hand is not
  // undone on the next render.
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on the story, not on the frame the user may have chosen since
  useEffect(() => {
    setViewport(story?.viewport ?? 'fit');
    setRotate(false);
  }, [story?.id]);

  const pickViewport = useCallback((next: ViewportName) => {
    setViewport(next);
    setRotate(false);
  }, []);

  return {
    viewport,
    rotate,
    surface,
    full,
    theme,
    setRotate,
    setSurface,
    setFull,
    pickViewport,
    pickTheme,
  };
}

function WorkbenchShell({
  stories,
  brand,
  title,
  footer,
  lenses,
  router = DEFAULT_ROUTER,
}: Readonly<WorkbenchProps>) {
  const [at, go] = router();
  // The location is the source, not a mirror: a subscribing adapter has to be
  // able to move the canvas from outside.
  const selected = at.story ?? stories[0]?.id ?? '';
  const view: View = at.view ?? 'preview';
  const [navOpen, setNavOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [edits, setEdits] = useState<Record<string, Record<string, unknown>>>({});

  const layout = useLayout();
  const drawer = layout.nav === 'drawer';

  const openSearch = useCallback(() => setSearchOpen(true), []);
  useCommandKey(openSearch);

  useEffect(() => {
    if (!drawer) setNavOpen(false);
  }, [drawer]);

  const story = stories.find((candidate) => candidate.id === selected) ?? stories[0];
  const args = useMemo(() => ({ ...story?.args, ...edits[story?.id ?? ''] }), [story, edits]);

  const stage = useStageView(story);
  const { viewport, rotate, surface, full, theme, setRotate, setSurface, setFull, pickViewport } =
    stage;

  const select = useCallback(
    (id: string) => {
      go({ story: id, view: 'preview' });
      setNavOpen(false);
    },
    [go],
  );

  const show = useCallback((next: View) => go({ view: next }), [go]);

  const change = useCallback(
    (key: string, value: unknown) => {
      const id = story?.id ?? '';
      setEdits((prev) => ({ ...prev, [id]: { ...prev[id], [key]: value } }));
    },
    [story],
  );

  if (!story) return null;

  const body = renderBody(story, view, args);
  const docs = viewDocs(story, view);
  const code = viewCode(story, view, args);
  const showControls = !view.startsWith('demo:');

  if (at.shot) {
    return shotStage({ listOnly: !at.story, stories, story, body, surface, width: layout.width });
  }

  const panel = (
    <Panel
      story={story}
      args={args}
      onChange={change}
      onReset={() => setEdits((prev) => ({ ...prev, [story.id]: {} }))}
      showControls={showControls}
      layout={layout}
    />
  );

  const tree = (
    <Sidebar
      stories={stories}
      brand={brand}
      title={title}
      footer={footer}
      selected={story.id}
      onSelect={select}
      onSearch={openSearch}
      layout={layout}
      {...(drawer ? { onClose: () => setNavOpen(false) } : null)}
    />
  );

  return (
    <Box flex bg="bg">
      <Box flex row>
        {drawer || full ? null : tree}

        {/* `minW={0}` stops a wide story from pushing the column past the
            window instead of scrolling inside it. */}
        <Box flex minW={0}>
          <Box flex minW={0}>
            <Toolbar
              lenses={lenses}
              viewport={viewport}
              onViewport={pickViewport}
              surface={surface}
              onSurface={setSurface}
              theme={theme}
              onTheme={stage.pickTheme}
              rotate={rotate}
              onRotate={setRotate}
              full={full}
              onFull={setFull}
              onMenu={drawer && !full ? () => setNavOpen(true) : undefined}
              layout={layout}
            />
            <StoryHeading story={story} layout={layout} />
            <Tabs story={story} view={view} onView={show} layout={layout} />
            {docs ? (
              <Box px={layout.gutter} pt={14}>
                <RichText variant="meta" color="textDim">
                  {docs}
                </RichText>
              </Box>
            ) : null}
            <ViewportFrame
              viewport={viewport}
              surface={surface}
              pad={story.pad}
              width={story.width}
              rotate={rotate}
              inset={layout.stagePad}
            >
              {body}
            </ViewportFrame>
            {code ? (
              <CodeBar
                key={view}
                code={code}
                defaultOpen={view.startsWith('demo:') && layout.mode !== 'compact'}
                layout={layout}
              />
            ) : null}
          </Box>
          {layout.panel === 'below' && !full ? panel : null}
        </Box>

        {layout.panel === 'side' && !full ? panel : null}
      </Box>

      {drawer && navOpen ? <NavDrawer onClose={() => setNavOpen(false)}>{tree}</NavDrawer> : null}

      {searchOpen ? (
        <CommandPalette
          stories={stories}
          selected={story.id}
          onSelect={select}
          onClose={() => setSearchOpen(false)}
          width={layout.width}
        />
      ) : null}
    </Box>
  );
}

function NavDrawer({ onClose, children }: Readonly<{ onClose: () => void; children: ReactNode }>) {
  return (
    // `z` above the toolbar's 30 and below the palette's 40. The tree hangs
    // directly off this row: a wrapper box between them collapses it, because a
    // column stretches its children on the cross axis only.
    <Box absolute top={0} right={0} bottom={0} left={0} row z={35}>
      {children}
      <Focusable label="Close component list" ring={false} onPress={onClose} style={s.scrim} />
    </Box>
  );
}

function StoryHeading({ story, layout }: Readonly<{ story: Story; layout: WorkbenchLayout }>) {
  return (
    <Box px={layout.gutter} pt={layout.mode === 'compact' ? 16 : 22} gap={4}>
      <Text variant="overline" color="accent">
        {story.group}
      </Text>
      <Text variant="title" style={layout.mode === 'compact' ? s.titleCompact : s.title} lines={1}>
        {story.name}
      </Text>
    </Box>
  );
}

function renderBody(story: Story, view: View, args: Record<string, unknown>): ReactNode {
  if (view === 'matrix') return <Matrix rows={story.matrix} args={args} render={story.render} />;
  if (view === 'preview') return story.render(args);
  const at = Number(view.slice(view.indexOf(':') + 1));
  return view.startsWith('demo:') ? story.demos[at]?.render() : story.scenes[at]?.render(args);
}

function viewDocs(story: Story, view: View): string | undefined {
  if (view === 'preview' || view === 'matrix') return undefined;
  const at = Number(view.slice(view.indexOf(':') + 1));
  return view.startsWith('demo:') ? story.demos[at]?.docs : story.scenes[at]?.docs;
}

function viewCode(story: Story, view: View, args: Record<string, unknown>): string | null {
  if (view.startsWith('demo:')) {
    const at = Number(view.slice(view.indexOf(':') + 1));
    return story.demos[at]?.code ?? null;
  }
  if (view !== 'preview') return null;
  return story.controls.some((control) => control.variant) ? snippet(story, args) : null;
}

function Tabs({
  story,
  view,
  onView,
  layout,
}: Readonly<{
  story: Story;
  view: View;
  onView: (next: View) => void;
  layout: WorkbenchLayout;
}>) {
  const tabs: { name: string; target: View; demo?: boolean }[] = [
    { name: 'Preview', target: 'preview' },
    ...(story.matrix.length > 0 ? [{ name: 'Matrix', target: 'matrix' as View }] : []),
    ...story.scenes.map((scene, index) => ({
      name: scene.name,
      target: `scene:${index}` as View,
    })),
    ...story.demos.map((entry, index) => ({
      name: entry.name,
      target: `demo:${index}` as View,
      demo: true,
    })),
  ];
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={s.tabRow}
      contentContainerStyle={s.tabRowBody}
    >
      <Box row grow={1} gap={4} px={Math.max(0, layout.gutter - 12)} mt={14} style={RULE}>
        {tabs.map((tab) => {
          const active = view === tab.target;
          return (
            <Focusable
              key={tab.target}
              label={tab.name}
              ring={false}
              onPress={() => onView(tab.target)}
              sv={canvasTab}
              vars={{ active }}
            >
              {({ focused }) => (
                <Box row align="center" gap={7}>
                  {tab.demo ? (
                    <Box w={5} h={5} radius="pill" bg={tabInk(active, focused, 'accent')} />
                  ) : null}
                  <Text variant="meta" color={tabInk(active, focused, 'text')} style={s.tabLabel}>
                    {tab.name}
                  </Text>
                </Box>
              )}
            </Focusable>
          );
        })}
      </Box>
    </ScrollView>
  );
}

function CodeBar({
  code,
  defaultOpen,
  layout,
}: Readonly<{ code: string; defaultOpen: boolean; layout: WorkbenchLayout }>) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Box style={[RULE_TOP, s.codeBar]}>
      <Focusable
        label={open ? 'Hide code' : 'Show code'}
        ring={false}
        onPress={() => setOpen((prev) => !prev)}
        sv={codeToggle}
        style={{ paddingHorizontal: layout.gutter }}
      >
        <Box row align="center" gap={8}>
          <Text variant="overline" color={open ? 'accent' : 'textDim'}>
            Code
          </Text>
          <Text variant="meta" color="textDim" style={s.codeHint}>
            {open ? '▾' : '▸'}
          </Text>
        </Box>
      </Focusable>
      {/* No scroller of its own: <CodeBlock> owns both axes. */}
      {open ? (
        <Box px={layout.gutter} pb={18}>
          <CodeBlock code={code} copy maxHeight={layout.mode === 'compact' ? 180 : 260} />
        </Box>
      ) : null}
    </Box>
  );
}

function tabInk(active: boolean, focused: boolean, selected: ColorToken): ColorToken {
  if (active) return selected;
  return focused ? 'textMuted' : 'textDim';
}

const SHOT_PAD = 32;
const s = styles({
  title: { fontSize: 24 },
  titleCompact: { fontSize: 20 },
  scrim: { flex: true, bg: 'bg/60' },
  tabRow: { grow: 0, shrink: 0 },
  // `flexGrow` keeps the rule under the tabs running the full width of the
  // canvas when the tabs themselves do not fill it.
  tabRowBody: { grow: 1 },
  tabLabel: { fontSize: 13.5, fontWeight: '600' },
  codeBar: { maxH: 320 },
  codeHint: { fontSize: 10 },
});
const canvasTab = sv({
  base: { ...TAB, _focus: { bg: 'white/6' } },
  variants: { active: { true: { borderBottomColor: 'accent' } } },
  defaults: { active: false },
});
const codeToggle = sv({ base: { py: 12, _focus: { bg: 'white/6' } } });

// Built once: an adapter is a hook, and a fresh one per render would remount
// its state.
const DEFAULT_ROUTER = pathRouter();

export type { WorkbenchProps };
export { Workbench };
