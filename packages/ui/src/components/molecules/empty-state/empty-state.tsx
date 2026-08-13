import type { ReactNode } from 'react';
import { Box } from '#ui/components/atoms/box';
import { Icon, type IconName } from '#ui/components/atoms/icon';
import { Text } from '#ui/components/atoms/text';
import { styles } from '#ui/core';
import { partContext } from '#ui/lib/part-context';

type EmptyStateSize = 'sm' | 'md' | 'tv';

type EmptyStateLayout = 'inline' | 'fill';

const [Context, useSize] = partContext<EmptyStateSize>('EmptyState.Root');

function useShape(part: string): Shape {
  return SHAPE[useSize(part)];
}

type EmptyStateMedia = 'icon' | 'plain';

interface MediaProps {
  /** `icon` sinks the mark into the round well; `plain` draws no well, for media
   *  that brings its own shape. */
  variant?: EmptyStateMedia;
  /** Sugar for the common case: a glyph, drawn at the size the Root declared.
   *  Media the kit cannot size for you goes through `children` instead. */
  name?: IconName;
  children?: ReactNode;
}

interface RootProps {
  /** `sm` stands in for a list inside a section, `md` for a page, `tv` for a
   *  page read across a room. */
  size?: EmptyStateSize;
  /** `fill` makes the state THE page: it takes the whole region it was given
   *  and centres in it, instead of hanging below whatever came before. */
  layout?: EmptyStateLayout;
  /** The mark, as a glyph the kit can size, drawn above the column. Media it
   *  cannot size goes through <EmptyState.Media> instead. */
  icon?: IconName;
  /** The column, in the order it is read: a <Title>, a <Hint>, a <Detail>, an
   *  <Actions>. */
  children?: ReactNode;
}

function Root({ size = 'md', layout = 'inline', icon, children }: Readonly<RootProps>) {
  const shape = SHAPE[size];
  const frame = frameOf(shape, layout);
  return (
    <Context.Provider value={size}>
      <Box center gap={shape.gap} flex={frame.flex} py={frame.py}>
        {icon ? <Media name={icon} /> : null}
        {children}
      </Box>
    </Context.Provider>
  );
}

/** The mark that says which kind of nothing this is. `icon` sinks its child into
 *  the kit's round well; `plain` leaves media that brings its own shape (a
 *  poster, an avatar, an illustration) alone. */
function Media({ variant = 'icon', name, children }: Readonly<MediaProps>) {
  const shape = useShape('Media');
  const mark = name ? <Icon name={name} size={shape.glyph} color="textDim" /> : children;
  if (variant === 'plain') return <Box center>{mark}</Box>;
  return (
    <Box center w={shape.badge} h={shape.badge} radius="circle" bg="tint/5" border="tint/8">
      {mark}
    </Box>
  );
}

/** What is missing. */
function Title({ children }: Readonly<{ children: ReactNode }>) {
  const shape = useShape('Title');
  return (
    <Text variant={shape.titleVariant} style={[s.centred, shape.titleStyle]}>
      {children}
    </Text>
  );
}

/** Why it is missing, and what would fix it. */
function Hint({ children }: Readonly<{ children: ReactNode }>) {
  const shape = useShape('Hint');
  return (
    <Text variant="body" color="textMuted" style={[s.centred, shape.hintStyle]}>
      {children}
    </Text>
  );
}

/** The raw cause, when there is one worth showing: an error message, a path.
 *  Set apart in a chip under the hint, the way the error pages do. */
function Detail({ children }: Readonly<{ children: ReactNode }>) {
  useShape('Detail');
  return (
    <Box bg="surface1" border="border" radius="md" px={14} py={10} maxW={420}>
      <Text variant="meta" color="textDim" style={s.centred}>
        {children}
      </Text>
    </Box>
  );
}

/** The one thing to do about it, held off the text above it. */
function Actions({ children }: Readonly<{ children: ReactNode }>) {
  const shape = useShape('Actions');
  return <Box mt={shape.actionMt}>{children}</Box>;
}

function frameOf(shape: Shape, layout: EmptyStateLayout) {
  if (layout === 'fill') return FILL;
  return { flex: undefined, py: shape.inlinePad } as const;
}

const FILL = { flex: 1, py: 64 } as const;

const s = styles({
  centred: { textAlign: 'center' },
  titleSm: { mt: 2, fontWeight: '700' },
  titleMd: { mt: 6 },
  hint: { fontSize: 14.5, lineHeight: 22, maxW: 420 },
  hintTv: { maxW: 720 },
});

// A section's worth, a screen's worth, and a screen's worth at ten feet.
const SHAPE = {
  sm: {
    gap: 8,
    badge: 56,
    glyph: 24,
    titleVariant: 'body' as const,
    titleStyle: s.titleSm,
    hintStyle: s.hint,
    actionMt: 6,
    inlinePad: 24,
  },
  md: {
    gap: 10,
    badge: 64,
    glyph: 26,
    titleVariant: 'title' as const,
    titleStyle: s.titleMd,
    hintStyle: s.hint,
    actionMt: 6,
    inlinePad: 64,
  },
  tv: {
    gap: 16,
    badge: 88,
    glyph: 40,
    titleVariant: 'h2' as const,
    titleStyle: null,
    hintStyle: s.hintTv,
    actionMt: 8,
    inlinePad: 96,
  },
};

type Shape = (typeof SHAPE)[EmptyStateSize];

const EmptyState = { Root, Media, Title, Hint, Detail, Actions };

export type {
  EmptyStateLayout,
  EmptyStateMedia,
  EmptyStateSize,
  MediaProps as EmptyStateMediaProps,
  RootProps as EmptyStateRootProps,
};
export { EmptyState };
