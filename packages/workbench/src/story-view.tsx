// One story on the canvas: the toolbar's lenses, the heading, the tabs across
// its views, the frame it renders in and the code drawer under it.
//
// Which of those views is being looked at is a `View`, and everything the canvas
// needs is READ from it rather than held beside it - the body, the prose, the
// sample and the script are four answers to the same question.

import { Box, CodeBlock, Focusable, setTheme, styles, sv, Text } from '@kroma/ui/kit';
import type { ColorToken } from '@kroma/ui/tokens';
import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { Matrix, ViewportFrame } from './canvas';
import { CanvasTabs } from './canvas-tabs';
import { RULE_TOP } from './chrome';
import { RichText, snippet } from './docs';
import type { WorkbenchLayout } from './layout';
import type { PlayRunner } from './play';
import type { PlayFunction } from './play-types';
import type { Story } from './story';
import { fullyInlined, inlineArgs } from './story-code-inline';
import { PREVIEW_THEMES } from './themes';
import { Toolbar, type ToolbarLens } from './toolbar';
import { type View, viewIndex } from './view';
import type { ViewportName } from './viewport';

/** The lenses the toolbar sets and the canvas reads. Held here rather than in
 * the shell because every one of them is about the story on screen. */
function useStageView(story: Story | undefined) {
  const [viewport, setViewport] = useState<ViewportName>('fit');
  const [rotate, setRotate] = useState(false);
  const [surface, setSurface] = useState<ColorToken>('bg');
  const [full, setFull] = useState(false);
  const [themeId, setThemeId] = useState('kroma');

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
    theme: themeId,
    setRotate,
    setSurface,
    setFull,
    pickViewport,
    pickTheme,
  };
}

type StageView = ReturnType<typeof useStageView>;

interface StoryCanvasProps {
  story: Story;
  view: View;
  onView: (next: View) => void;
  args: Record<string, unknown>;
  run: PlayRunner;
  stage: StageView;
  lenses?: readonly ToolbarLens[];
  layout: WorkbenchLayout;
  /** Opens the component list; set only while the tree is a drawer. */
  onMenu?: () => void;
}

function StoryCanvas({
  story,
  view,
  onView,
  args,
  run,
  stage,
  lenses,
  layout,
  onMenu,
}: Readonly<StoryCanvasProps>) {
  const docs = viewDocs(story, view);
  const code = viewCode(story, view, args);
  return (
    // `minW={0}` stops a wide story from pushing the column past the window
    // instead of scrolling inside it.
    <Box flex minW={0} minH={0}>
      <Toolbar
        lenses={lenses}
        viewport={stage.viewport}
        onViewport={stage.pickViewport}
        surface={stage.surface}
        onSurface={stage.setSurface}
        theme={stage.theme}
        onTheme={stage.pickTheme}
        rotate={stage.rotate}
        onRotate={stage.setRotate}
        full={stage.full}
        onFull={stage.setFull}
        onMenu={onMenu}
        layout={layout}
      />
      <StoryHeading story={story} layout={layout} />
      <CanvasTabs story={story} view={view} onView={onView} layout={layout} />
      {docs ? (
        <Box px={layout.gutter} pt={14}>
          <RichText variant="meta" color="textDim">
            {docs}
          </RichText>
        </Box>
      ) : null}
      <ViewportFrame
        viewport={stage.viewport}
        surface={stage.surface}
        pad={story.pad}
        width={story.width}
        rotate={stage.rotate}
        inset={layout.stagePad}
      >
        {/* Fills the frame rather than hugging its content: a story that asks
            for the whole stage (the player, a screen) is written as `flex`, and
            `flex: 1` against a parent with no definite height resolves to zero,
            which is a component drawn at no height at all. */}
        <Box ref={run.stage} flex minH={0}>
          {renderBody(story, view, args)}
        </Box>
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
  const at = viewIndex(view);
  return view.startsWith('demo:') ? story.demos[at]?.render() : story.scenes[at]?.render(args);
}

// A scene may drive the component differently enough to want its own script;
// falling back to the story's keeps one written play running on every view of it.
function playFor(story: Story, view: View): PlayFunction | undefined {
  if (view === 'preview' || view === 'matrix') return story.play;
  if (view.startsWith('demo:')) return undefined;
  return story.scenes[viewIndex(view)]?.play ?? story.play;
}

function viewDocs(story: Story, view: View): string | undefined {
  if (view === 'preview' || view === 'matrix') return undefined;
  const at = viewIndex(view);
  return view.startsWith('demo:') ? story.demos[at]?.docs : story.scenes[at]?.docs;
}

// Every view's code is the code its author WROTE, wherever a build could read
// it: a demo's whole file, a scene's JSX, the story's own render, each with the
// args the canvas drew it with written in.
//
// A generated call site is the fallback rather than the rule. It is the only
// thing to show for a render that spreads a bag of props into one element,
// where the source says nothing a reader could copy; but it flattens a compound
// into props it does not have, so authored markup wins wherever there is any.
function viewCode(story: Story, view: View, args: Record<string, unknown>): string | null {
  if (view.startsWith('demo:')) return story.demos[viewIndex(view)]?.code ?? null;
  // A scene that declares neither `example` nor `render` is drawn by the story's
  // own render, so that is the code that drew it - but only where the story has
  // something to show. A story whose render the build could not read has just
  // its variants to generate from, and a generated call beside a scene it did
  // not draw is a guess.
  if (view.startsWith('scene:')) {
    const scene = story.scenes[viewIndex(view)];
    if (scene?.code) return inlineArgs(scene.code, args);
    if (story.code) return inlineArgs(story.code, args);
    return story.named ? snippet(story, args) : null;
  }
  if (view !== 'preview') return null;
  return previewCode(story, args);
}

// A story that names a `component` and writes no render has no source to read:
// the workbench draws it from the args, and the call site it would draw is
// exactly what the generated one says. So the fallback is the snippet, not
// nothing, and 29 of the kit's stories get a code panel because of it.
function previewCode(story: Story, args: Record<string, unknown>): string | null {
  const authored = fullyInlined(story.code, args);
  if (authored) return authored;
  if (story.controls.some((control) => control.variant)) return snippet(story, args);
  // Source that did not resolve still reads as source, minus the arrow around
  // it. With no source at all there are two cases, and only one of them has an
  // answer: a story that NAMED its component is drawn from the args, so the
  // generated call is exactly what drew it; a story whose render the build
  // could not read shows nothing rather than a guess about it.
  return inlineArgs(story.code, args) ?? (story.named ? snippet(story, args) : null);
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
          <CodeBlock code={code} maxHeight={layout.mode === 'compact' ? 180 : 260} />
        </Box>
      ) : null}
    </Box>
  );
}

const s = styles({
  title: { fontSize: 24 },
  titleCompact: { fontSize: 20 },
  codeBar: { maxH: 320 },
  codeHint: { fontSize: 10 },
});
const codeToggle = sv({ base: { py: 12, _focus: { bg: 'white/6' } } });

export { playFor, renderBody, StoryCanvas, useStageView, viewCode };
