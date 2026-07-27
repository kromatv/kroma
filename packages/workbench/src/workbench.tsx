// The workbench shell.
//
// This is the replacement for Storybook, and the reason it can be this small is
// that it is not a separate application. Storybook ships a manager UI, an iframe
// protocol between it and your components, a builder abstraction and an addon
// API, because it has to host any framework's components inside its own React
// tree. Here the components and the tool are the same design system, rendered by
// the same renderer, in one tree. What is left after removing all of that is a
// tree, a canvas and an inspector.
//
// The consequence worth the trouble: it runs wherever the kit runs. Open it in a
// browser shell, or mount it in the Apple TV app, and you are inspecting the
// components on the device that actually has to display them.
//
// It knows NO APP. The stories are a prop, the mark at the top of the tree is a
// slot, and any lens beyond the ones acting on its own canvas is handed in. That
// is what lets a second design system mount this without forking it, and it is
// why the one thing this file used to import from the app - the i18n provider,
// so translated components could render at all - is now the host's job to wrap
// around it. See the package README for the twelve lines that binding takes.
//
// The LAYOUT it wears is Storybook's, because that arrangement has been argued
// over for ten years and it wins on the same grounds every time: the brand and
// the search sit at the top of the explorer, the toolbar spans only the canvas
// it acts on, and the addons panel is tabbed. There is no full-width chrome, so
// nothing on screen is unattached to the component being looked at.

import { Box, configureRemote, Focusable, FocusScope, Txt } from '@kroma/ui/kit';
import type { ColorToken } from '@kroma/ui/tokens';
import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView } from 'react-native';
import { Matrix, stageWidth, ViewportFrame, type ViewportName } from './canvas';
import { FOCUS_WASH, RULE, RULE_TOP, TAB, TAB_ACTIVE } from './chrome';
import { CodeBlock } from './code';
import { CommandPalette, useCommandKey } from './command';
import { RichText, snippet } from './docs';
import { useLayout, type WorkbenchLayout } from './layout';
import { Panel } from './panel';
import { pathRouter, type View, type WorkbenchRouter } from './router';
import { Sidebar } from './sidebar';
import type { Story } from './story';
import { Toolbar, type ToolbarLens } from './toolbar';

interface WorkbenchProps {
  /**
   * Every story to show, already ordered and levelled.
   *
   * A prop rather than an import, and that is the whole of what "generic" means
   * here: discovery needs a BUNDLER primitive (`import.meta.glob` on Vite,
   * `require.context` on Metro) and both are resolved relative to the file that
   * writes them, so a registry can only ever live in the package whose stories
   * it is globbing. This package therefore does not glob; it is handed the
   * result. See `attachTiers` / `orderStories` / `attachDemos`, which are the
   * pieces a host builds one out of.
   */
  stories: readonly Story[];
  /** The mark at the top of the tree. Drawn as given; nothing without it. */
  brand?: ReactNode;
  /** The wordmark beside the mark. Defaults to naming the tool. */
  title?: string;
  /** Pinned under the story tree: a build stamp, a link, whatever the host wants
   * to say about itself. Nothing without it. */
  footer?: ReactNode;
  /** Lenses on the toolbar beyond the canvas's own: a locale, a theme. */
  lenses?: readonly ToolbarLens[];
  /**
   * How this mount is routed. See router.ts for why it is a port rather than a
   * decision: the same shell runs where it owns the address bar, where it is
   * squatting on someone else's page, where there is no address bar at all, and
   * where another router already owns the history.
   *
   * Defaults to the `?story=&view=` contract, degrading to memory off the web.
   * A mount nested inside a host router wants `memoryRouter()`, and one that
   * should share the host's history wants `tanstackRouter()`.
   */
  router?: WorkbenchRouter;
}

/** The workbench mounts standalone (the kit site, `?workbench` on a shell, the
 * native apps' workbench entry), so no screen has wrapped it in a navigator:
 * every `Focusable` it renders - the tree, the tools, the stories themselves -
 * needs this scope, and it is also what lets a D-pad drive the workbench on a
 * television. */
function Workbench(props: Readonly<WorkbenchProps>) {
  // Standalone surfaces own their remote, the way TvApp does: nothing above the
  // workbench will have pointed the navigator at this build's key source.
  //
  // IN RENDER rather than at module load, and that is a fix rather than a
  // tidy-up. `index.ts` re-exports this file, so a bare module-scope call meant
  // that merely importing `story()` from @kroma/workbench - which every
  // *.stories.tsx in the design system does - reconfigured the host app's
  // navigator. On the phone the workbench is an Expo Router route module, so
  // simply enumerating the route context was enough to overwrite the app's key
  // source without the workbench ever rendering.
  //
  // And in render rather than in an EFFECT, which is the second half of the fix:
  // effects mount children-first, so the navigator inside <FocusScope> below
  // subscribed to a remote nobody had configured yet - the library warned, the
  // subscription was dead, and on an Apple TV that is every input there is. A
  // lazy `useState` initializer runs during this component's own first render,
  // strictly before any child renders, and never again. `configureRemote` is
  // idempotent either way.
  useState(configureRemote);
  return (
    <FocusScope>
      <WorkbenchShell {...props} />
    </FocusScope>
  );
}

/**
 * The screenshot runner's view: the story alone on the page, with none of the
 * workbench around it.
 *
 * Split out because it shares nothing with the shell - no tree, no panel, no
 * toolbar, no keyboard - and its two branches were most of what made the shell's
 * own body hard to follow.
 */
function shotStage(at: {
  /** `?shot` with no story is the runner asking what exists. Answering from the
   *  app itself means there is no second list of ids to keep in step. */
  listOnly: boolean;
  stories: readonly Story[];
  story: Story;
  body: ReactNode;
  surface: ColorToken;
  width: number;
}): ReactNode {
  if (at.listOnly) {
    return <Txt>{`KROMA_STORY_IDS:${at.stories.map((entry) => entry.id).join(',')}`}</Txt>;
  }
  // A story that declares a width MEASURES itself and has to be given one - the
  // same rule the canvas follows (see `stageWidth`), against the window rather
  // than a stage card, because the shot has no stage. Without it a rail was
  // captured as a single clipped tile: it asked how wide it was, was told
  // nothing, and laid out one column.
  const stage = stageWidth(at.story.width, at.width - SHOT_PAD * 2);
  return (
    <Box flex bg={at.surface} p={SHOT_PAD} align="flex-start" justify="flex-start">
      <Box w={stage.width}>{at.body}</Box>
    </Box>
  );
}

/** How the stage is being LOOKED at: which device frame, whether it is turned,
 * what it sits on, and whether it has the whole window.
 *
 * One hook because they are one concept and they interact - picking a frame
 * resets the rotation, and opening a story in its authored frame has to do the
 * same. Left inline they were four useStates and two effects in a body that
 * also owns routing, the drawer, the search and the per-story edits. */
function useStageView(story: Story | undefined) {
  const [viewport, setViewport] = useState<ViewportName>('fit');
  // The frame on its side. Not part of the frame itself: it is a way of LOOKING
  // at one, and the two devices that turn share the one switch.
  const [rotate, setRotate] = useState(false);
  const [surface, setSurface] = useState<ColorToken>('bg');
  // The canvas with the whole window: no tree, no inspector. What you reach for
  // to look at a 1920 stage on a laptop, where the two columns beside it are
  // most of the width the component wanted.
  const [full, setFull] = useState(false);

  // A story authored for a device frame opens in it (see StoryDef.viewport).
  // An effect rather than derived state so the toolbar stays in charge after:
  // switching frame by hand must not be undone on the next render.
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on the story, not on the frame the user may have chosen since
  useEffect(() => {
    setViewport(story?.viewport ?? 'fit');
    setRotate(false);
  }, [story?.id]);

  /** A frame is picked to see the component IN it, upright. Carrying the last
   * frame's orientation across is a state nobody asked for, and on a frame that
   * does not turn it would be a state with no way back. */
  const pickViewport = useCallback((next: ViewportName) => {
    setViewport(next);
    setRotate(false);
  }, []);

  return { viewport, rotate, surface, full, setRotate, setSurface, setFull, pickViewport };
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
  // The location is the SOURCE for these two, not a mirror of them: an adapter
  // that subscribes (the TanStack one) has to be able to move the canvas from
  // outside, and it can only do that if nothing here shadows what it says.
  const selected = at.story ?? stories[0]?.id ?? '';
  const view: View = at.view ?? 'preview';
  const [navOpen, setNavOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  // Edits are kept per story, so wandering off to check another component and
  // coming back does not throw away what you had set up.
  const [edits, setEdits] = useState<Record<string, Record<string, unknown>>>({});

  const layout = useLayout();
  const drawer = layout.nav === 'drawer';

  // ⌘K from anywhere, including from inside a story's own text field - see
  // command.tsx for why that needs the capture phase.
  const openSearch = useCallback(() => setSearchOpen(true), []);
  useCommandKey(openSearch);

  // Widen the window past the drawer breakpoint and the tree is a column again,
  // which would otherwise leave an open drawer floating over its own column.
  useEffect(() => {
    if (!drawer) setNavOpen(false);
  }, [drawer]);

  const story = stories.find((candidate) => candidate.id === selected) ?? stories[0];
  const args = useMemo(() => ({ ...story?.args, ...edits[story?.id ?? ''] }), [story, edits]);

  const stage = useStageView(story);
  const { viewport, rotate, surface, full, setRotate, setSurface, setFull, pickViewport } = stage;

  const select = useCallback(
    (id: string) => {
      go({ story: id, view: 'preview' });
      // Picking from the drawer is the end of the errand it was opened for.
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
  // A demo takes no args, so the controls would edit nothing: the panel gives
  // the room to the docs instead.
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

        {/* The canvas column. `minW={0}` is what stops a wide story (a matrix, a
            long code line) from pushing the column past the window instead of
            scrolling inside it. */}
        <Box flex minW={0}>
          <Box flex minW={0}>
            <Toolbar
              lenses={lenses}
              viewport={viewport}
              onViewport={pickViewport}
              surface={surface}
              onSurface={setSurface}
              rotate={rotate}
              onRotate={setRotate}
              full={full}
              onFull={setFull}
              // Full screen means the canvas and the toolbar: the drawer's own
              // handle would be a way straight back out of it.
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
              // Remounted per view so the drawer opens for a demo (whose code IS
              // the point) and stays shut on the live preview. Not on a phone:
              // there the open drawer would leave the example itself a sliver.
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

/** The story tree over the canvas, with the rest of the page dimmed behind it.
 * The dim is itself the dismiss target, which is the gesture everyone already
 * has for a drawer, and it is a `Focusable` so a remote and a keyboard can
 * reach it too. */
function NavDrawer({ onClose, children }: Readonly<{ onClose: () => void; children: ReactNode }>) {
  return (
    // `z` above the toolbar's 30 and below the palette's 40: the drawer floats
    // over ALL of the canvas column - a toolbar drawn over the story list read
    // as the drawer starting a row down - and the palette, which the drawer's
    // own search button opens, still lands on top.
    //
    // The tree hangs DIRECTLY off this row, exactly as it does off the shell's
    // column-mode row. It used to sit in a plain wrapper box, and that wrapper
    // is why the drawer arrived collapsed: the row stretched the wrapper to
    // full height, but a column stretches its children on the CROSS axis only,
    // so the sidebar inside kept its content height and the `flex: 1` tree
    // under its search row resolved against nothing and disappeared.
    <Box absolute top={0} right={0} bottom={0} left={0} row z={35}>
      {children}
      <Focusable label="Close component list" ring={false} onPress={onClose} style={SCRIM} />
    </Box>
  );
}

/** Where you are: the section, then the component. */
function StoryHeading({ story, layout }: Readonly<{ story: Story; layout: WorkbenchLayout }>) {
  return (
    <Box px={layout.gutter} pt={layout.mode === 'compact' ? 16 : 22} gap={4}>
      <Txt variant="overline" color="accent">
        {story.group}
      </Txt>
      <Txt variant="title" style={layout.mode === 'compact' ? TITLE_COMPACT : TITLE} lines={1}>
        {story.name}
      </Txt>
    </Box>
  );
}

/** What the canvas shows for the current tab. */
function renderBody(story: Story, view: View, args: Record<string, unknown>): ReactNode {
  if (view === 'matrix') return <Matrix rows={story.matrix} args={args} render={story.render} />;
  if (view === 'preview') return story.render(args);
  const at = Number(view.slice(view.indexOf(':') + 1));
  return view.startsWith('demo:') ? story.demos[at]?.render() : story.scenes[at]?.render(args);
}

/** The prose for the current tab, when it has any: a scene and a demo each get
 * to say what they are showing. */
function viewDocs(story: Story, view: View): string | undefined {
  if (view === 'preview' || view === 'matrix') return undefined;
  const at = Number(view.slice(view.indexOf(':') + 1));
  return view.startsWith('demo:') ? story.demos[at]?.docs : story.scenes[at]?.docs;
}

/** The code for the current tab: a demo shows its own source, and the live
 * preview shows the call site the controls currently describe. */
function viewCode(story: Story, view: View, args: Record<string, unknown>): string | null {
  if (view.startsWith('demo:')) {
    const at = Number(view.slice(view.indexOf(':') + 1));
    return story.demos[at]?.code ?? null;
  }
  // Only components have a call site worth synthesizing; a foundation story
  // (colours, type) would produce a meaningless one-liner.
  if (view !== 'preview') return null;
  return story.controls.some((control) => control.variant) ? snippet(story, args) : null;
}

/** The canvas tabs: the live component, the derived matrix, the story's own
 * scenes, then its demos. Underlined like a document, not chipped like a
 * filter: exactly one is ever active. Demos are marked, because "a worked
 * example with its own code" and "the same component under other args" are
 * different promises to the reader. */
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
    // A story with several scenes and demos outruns a narrow window, so the row
    // scrolls sideways rather than wrapping into a second rule-less line.
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={TAB_ROW}
      // `flexGrow` on the content is what keeps the rule under the tabs running
      // the full width of the canvas when the tabs themselves do not fill it.
      contentContainerStyle={TAB_ROW_BODY}
    >
      {/* Inset by the tab's own padding, so the first LABEL still lines up with
          the story title above it rather than the hover box's edge. The gap only
          has to top the padding up to the row's rhythm. */}
      <Box row grow={1} gap={4} px={Math.max(0, layout.gutter - 12)} mt={14} style={RULE}>
        {tabs.map((tab) => {
          const active = view === tab.target;
          return (
            <Focusable
              key={tab.target}
              label={tab.name}
              ring={false}
              onPress={() => onView(tab.target)}
              style={[TAB, active && TAB_ACTIVE]}
              focusedStyle={FOCUS_WASH}
            >
              {/* The label lifts with the wash. Left dim, the hover reads as a
                box appearing behind dead text rather than as the tab waking. */}
              {({ focused }) => (
                <Box row align="center" gap={7}>
                  {tab.demo ? (
                    <Box w={5} h={5} radius="pill" bg={tabInk(active, focused, 'accent')} />
                  ) : null}
                  <Txt variant="meta" color={tabInk(active, focused, 'text')} style={TAB_LABEL}>
                    {tab.name}
                  </Txt>
                </Box>
              )}
            </Focusable>
          );
        })}
      </Box>
    </ScrollView>
  );
}

/** The code drawer under the canvas. On the live preview it holds the call site
 * the controls currently describe, synthesized fresh on every change: flip a
 * variant and the code flips with it. On a demo it holds that demo's source,
 * open from the start, because a worked example without its code is half an
 * example. */
function CodeBar({
  code,
  defaultOpen,
  layout,
}: Readonly<{ code: string; defaultOpen: boolean; layout: WorkbenchLayout }>) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Box style={CODE_BAR}>
      <Focusable
        label={open ? 'Hide code' : 'Show code'}
        ring={false}
        onPress={() => setOpen((prev) => !prev)}
        style={[CODE_TOGGLE, { paddingHorizontal: layout.gutter }]}
        focusedStyle={FOCUS_WASH}
      >
        <Box row align="center" gap={8}>
          <Txt variant="overline" color={open ? 'accent' : 'textDim'}>
            Code
          </Txt>
          <Txt variant="meta" color="textDim" style={CODE_HINT}>
            {open ? '▾' : '▸'}
          </Txt>
        </Box>
      </Focusable>
      {/* No scroller of its own: <CodeBlock> owns both axes, and a second
          vertical one out here would just add a scrollbar that fights it. */}
      {open ? (
        <Box px={layout.gutter} pb={18}>
          <CodeBlock code={code} copy maxHeight={layout.mode === 'compact' ? 180 : 260} />
        </Box>
      ) : null}
    </Box>
  );
}

/** A tab's ink: the selected one is emphatic, the merely focused one is lifted
 * out of the row, and the rest recede. `selected` differs per element (the demo
 * dot is amber, the label is plain text), the other two never do. */
function tabInk(active: boolean, focused: boolean, selected: ColorToken): ColorToken {
  if (active) return selected;
  return focused ? 'textMuted' : 'textDim';
}

const TITLE = { fontSize: 24 } as const;
const TITLE_COMPACT = { fontSize: 20 } as const;
/** The margin around a captured story. The shot is the component, so this is
 * only enough to keep its own shadow off the edge of the PNG. */
const SHOT_PAD = 32;
const SCRIM = { flex: 1, backgroundColor: 'rgba(10, 10, 12, 0.6)' } as const;
const TAB_ROW = { flexGrow: 0, flexShrink: 0 } as const;
const TAB_ROW_BODY = { flexGrow: 1 } as const;
const TAB_LABEL = { fontSize: 13.5, fontWeight: '600' } as const;
const CODE_BAR = { ...RULE_TOP, maxHeight: 320 } as const;
const CODE_TOGGLE = { paddingVertical: 12 } as const;
const CODE_HINT = { fontSize: 10 } as const;

/** The routing every mount gets unless it says otherwise. Built once: an
 * adapter is a hook, and a fresh one per render would remount its state. */
const DEFAULT_ROUTER = pathRouter();

export type { WorkbenchProps };
export { Workbench };
