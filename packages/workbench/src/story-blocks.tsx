// The blocks only a `.story.mdx` writes: the scene as it appears IN the
// document, and the do/don't guidance beside it. They reach every document
// through the same components map as the element map, so a story file imports
// nothing to use them.

import { Box, Icon, styles, Text } from '@kroma/ui/kit';
import { space } from '@kroma/ui/tokens';
import { createContext, type ReactNode, useContext } from 'react';
import type { Args } from './derive';
import { DocFigure, GuidelineToneContext, MEASURE } from './mdx-blocks';
import { useSection } from './outline';

// A story's document is its prose, its scenes and its guidance; only four of
// the hundred write a `##` of their own. So the blocks report themselves to the
// outline exactly as a heading does, and every document has a list worth
// showing in the rail beside it.
const SECTION_LEVEL = 2;

/** What a document's scenes render against: the story's current args and its
 * own render, for a scene that writes only `args`. Mounted by the Docs view;
 * absent wherever a document is shown with no story behind it. */
interface StoryDocScope {
  args: Args;
  render?: (args: Args) => ReactNode;
}

const StoryDocContext = createContext<StoryDocScope | undefined>(undefined);

interface SceneProps {
  /** The tab this scene is listed under on the canvas. */
  name: string;
  /** Values merged over the story's args for this take. */
  args?: Args;
  /** A take that reads the live args. Set by the compiler off the scene's
   * child; never written by hand. */
  render?: (args: Args) => ReactNode;
  /** A fixed composition, set by the compiler the same way. */
  example?: () => ReactNode;
  /** The scene's prose, shown under the specimen. */
  children?: ReactNode;
}

/** One named take on the component, rendered in the document where its
 * explanation lives. The compiler lifts the same take into the story's scene
 * tabs, so it is written once. */
function Scene({ name, args, render, example, children }: Readonly<SceneProps>) {
  const scope = useContext(StoryDocContext);
  const draw = render ?? scope?.render;
  const body = example ? example() : draw?.({ ...scope?.args, ...args });
  const section = useSection(SECTION_LEVEL, name);
  return (
    <DocFigure onLayout={section.onLayout}>
      {/* The prose introduces the specimen, which is the order it was written
          in: a sentence, then the thing it is about. */}
      {children}
      <Box style={s.scene}>
        <Box row align="center" gap={7} px={space[4]} py={space[2]} style={s.sceneHead}>
          <Icon name="photo" size={12} color="textDim" />
          <Text variant="overline" color="textDim">
            {name}
          </Text>
        </Box>
        <Box p={space[5]} align="flex-start">
          {body}
        </Box>
      </Box>
    </DocFigure>
  );
}

// Whether a card is one of a pair. A pair shares the row and each half takes
// half of it; a card standing alone must NOT grow, or in a column `flexGrow`
// stretches it down the page instead of across one.
const PairedContext = createContext(false);

/** A do and the don't it answers, side by side where there is room for two
 * columns and stacked where there is not. Built by the compiler out of the
 * `<Do>` and `<Dont>` written beside each other; never authored.
 *
 * `basis` is the width below which two columns stop being two columns: the
 * pair wraps rather than squeezing a sentence into a gutter. */
function Guidance({ children }: Readonly<{ children?: ReactNode }>) {
  const section = useSection(SECTION_LEVEL, 'Guidelines');
  return (
    <PairedContext.Provider value={true}>
      {/* Its own rhythm rather than a figure's: guidance closes a section
          rather than illustrating the line above it, so it is set off from the
          prose on BOTH sides instead of hugging what it follows. */}
      <Box row wrap gap={GUTTER} style={s.guidance} onLayout={section.onLayout}>
        {children}
      </Box>
    </PairedContext.Provider>
  );
}

interface CardProps {
  tone: 'do' | 'dont';
  children?: ReactNode;
}

// One card: a tinted panel, a label, and the lines. No header strip and no rule
// under it - at this size the chrome was taller than a line of the guidance it
// framed. The LABEL carries the verdict, which is why the lines inside do not
// repeat it: under a card that says Don't, "Don't stack two" says it twice.
function Card({ tone, children }: Readonly<CardProps>) {
  const good = tone === 'do';
  const ink = good ? 'success' : 'danger';
  const paired = useContext(PairedContext);
  return (
    <Box
      {...(paired ? { grow: 1, basis: CARD_BASIS, minW: 0 } : null)}
      p={space[4]}
      gap={space[3]}
      style={good ? s.cardDo : s.cardDont}
    >
      <Box row align="center" gap={6}>
        <Icon name={good ? 'check' : 'x'} size={12} color={ink} />
        <Text variant="overline" color={ink}>
          {good ? 'Do' : "Don't"}
        </Text>
      </Box>
      <GuidelineToneContext.Provider value={tone}>
        <Box gap={space[2]}>{children}</Box>
      </GuidelineToneContext.Provider>
    </Box>
  );
}

/** Guidance worth following: a markdown list, and anything worth showing beside
 * it - a fenced sample, or the component itself. */
function Do({ children }: Readonly<{ children?: ReactNode }>) {
  return <Card tone="do">{children}</Card>;
}

/** The misuses, written the same way. The card says "Don't", so the lines
 * inside do not have to. */
function Dont({ children }: Readonly<{ children?: ReactNode }>) {
  return <Card tone="dont">{children}</Card>;
}

// Two columns until a column would be narrower than a readable line.
const CARD_BASIS = 300;

// The gutter between the pair, and the same measure stacked when they wrap.
const GUTTER = space[4];

// Set off from the prose on both sides, the way a closing block is: the space
// above has to clear the paragraph's own margin to read as a break rather than
// as the next line of it.
const AROUND = { base: space[5], md: space[8] } as const;

// The tint is what tells the two apart at a glance, so it is kept low enough to
// read prose over: the ink and the mark carry the verdict, the wash only groups.
const CARD = { radius: 'lg' } as const;

const s = styles({
  guidance: { maxW: MEASURE.figure, mt: AROUND, mb: AROUND },
  cardDo: { ...CARD, border: 'success/20', bg: 'success/5' },
  cardDont: { ...CARD, border: 'danger/20', bg: 'danger/5' },
  scene: { radius: 'md', border: 'border', bg: 'surface1', overflow: 'hidden' },
  sceneHead: { borderBottomWidth: 1, borderBottomColor: 'border', bg: 'surface2' },
});

export type { SceneProps, StoryDocScope };
export { Do, Dont, Guidance, Scene, StoryDocContext };
