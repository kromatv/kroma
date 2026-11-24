import { type ReactNode, useMemo } from 'react';
import { Box } from '#ui/components/atoms/box';
import { Icon, type IconName } from '#ui/components/atoms/icon';
import { Text } from '#ui/components/atoms/text';
import { type ColorValue, styles, type TypeRole } from '#ui/core';
import { useStyles } from '#ui/core/styles';
import {
  CONTROL,
  type ControlMetrics,
  type ControlSize,
  useEntryDefaults,
} from '#ui/lib/field-shell';
import { partContext } from '#ui/lib/part-context';
import { sortParts } from '#ui/lib/parts';

type CalloutTone = 'neutral' | 'accent' | 'success' | 'danger';

interface Paint {
  bg: ColorValue;
  border: ColorValue;
  /** The tone's ink, solid at every step: a callout's glyph wears it too, and
   *  the palette never alphas a glyph. */
  ink: ColorValue;
}

const TONE: Record<CalloutTone, Paint> = {
  neutral: { bg: 'tint/6', border: 'border', ink: 'text' },
  accent: { bg: 'accentSoft', border: 'accent/25', ink: 'accentText' },
  success: { bg: 'success/9', border: 'success/25', ink: 'success' },
  danger: { bg: 'danger/10', border: 'danger/25', ink: 'dangerHover' },
};

const LIVE_ROLE: Record<CalloutTone, 'alert' | 'status' | undefined> = {
  neutral: undefined,
  accent: undefined,
  success: 'status',
  danger: 'alert',
};

interface Shape {
  title: TypeRole;
  detail: TypeRole;
  glyph: number;
}

// The well, the corner and the rhythm come off the control shell, because a
// callout sits in forms beside fields and has to read as the same family. What
// is its own is the type: a callout is read, not filled in.
const SHAPE: Record<ControlSize, Shape> = {
  sm: { title: 'meta', detail: 'meta', glyph: 16 },
  md: { title: 'body', detail: 'meta', glyph: 19 },
  tv: { title: 'bodyTv', detail: 'metaTv', glyph: 26 },
};

interface Context {
  shape: Shape;
  paint: Paint;
  metrics: ControlMetrics;
}

const [CalloutContext, useCallout] = partContext<Context>('Callout.Root');

function slot(written: readonly ReactNode[], sugar: ReactNode): ReactNode {
  return written.length > 0 ? written : sugar;
}

interface CalloutRootProps {
  /** What the block is saying, in the palette's own words, and what a reader
   *  hears when it appears: `danger` interrupts, `success` waits for a pause,
   *  the other two announce nothing. Defaults to `neutral`, so a tone is
   *  always a decision. */
  tone?: CalloutTone;
  /** The control shell's size, defaulting to the app's (`KitProvider`), so
   *  a callout in a form matches the fields around it without saying so. */
  size?: ControlSize;
  /** The mark, as a glyph the kit can size. Media it cannot size goes through
   *  <Callout.Media>, which wins the head of the row. */
  icon?: IconName;
  /** A DIRECT <Callout.Media> or <Callout.Actions> child is sorted into the head
   *  and tail of the row, so those two may be written anywhere; everything else
   *  is the message column, in the order it was written. */
  children?: ReactNode;
}

function Root({ tone = 'neutral', size, icon, children }: Readonly<CalloutRootProps>) {
  const entryDefaults = useEntryDefaults();
  const step = size ?? entryDefaults.size;
  const metrics = CONTROL[step];
  const [media, actions, message] = useMemo(() => sortParts(children, Media, Actions), [children]);
  const context = useMemo<Context>(
    () => ({ shape: SHAPE[step], paint: TONE[tone], metrics }),
    [step, tone, metrics],
  );

  const leading = slot(media, icon === undefined ? null : <Media name={icon} />);

  return (
    <CalloutContext.Provider value={context}>
      <Box
        row
        align="center"
        role={LIVE_ROLE[tone]}
        gap={metrics.gap}
        px={metrics.px}
        py={metrics.py}
        radius={metrics.radius}
        bg={context.paint.bg}
        border={context.paint.border}
      >
        {leading}
        {/* minW 0: without it a long message pushes the actions off the block
            instead of wrapping, which is the one thing a message must not do. */}
        <Box flex minW={0} gap={4}>
          {message}
        </Box>
        {actions}
      </Box>
    </CalloutContext.Provider>
  );
}

/** The mark that says which kind of thing this is, inked and sized by the Root.
 *  A glyph goes through `name`; media the kit cannot size goes through
 *  `children`. */
function Media({ name, children }: Readonly<{ name?: IconName; children?: ReactNode }>) {
  const { shape, paint } = useCallout('Media');
  if (name) {
    return <Icon name={name} size={shape.glyph} color={paint.ink} />;
  }
  return <Box shrink={0}>{children}</Box>;
}

/** The one sentence the block exists to say, in the tone's ink. */
function Title({ children }: Readonly<{ children: ReactNode }>) {
  const s = useStyles(sDefinition);

  const { shape, paint } = useCallout('Title');
  return (
    <Text variant={shape.title} color={paint.ink} style={s.title}>
      {children}
    </Text>
  );
}

/** The technical particular behind it: a path, a status line, what the server
 *  actually answered. Quiet whatever the tone, so the title keeps the colour. */
function Detail({ children }: Readonly<{ children: ReactNode }>) {
  const { shape } = useCallout('Detail');
  return (
    <Text variant={shape.detail} color="textMuted">
      {children}
    </Text>
  );
}

/** The one thing to do about it, pinned to the end of the row. */
function Actions({ children }: Readonly<{ children: ReactNode }>) {
  const { metrics } = useCallout('Actions');
  return (
    <Box row align="center" shrink={0} gap={metrics.gap}>
      {children}
    </Box>
  );
}

const sDefinition = styles({ title: { fontWeight: '600' } });

/**
 * A toned block carrying one message, and sometimes the action that answers it.
 * It is not a toast: it is part of the page and stays as long as what it reports
 * is true. Nor an <EmptyState>: it sits next to content that is there.
 *
 * ```tsx
 * <Callout.Root tone="danger">
 *   <Callout.Title>{error}</Callout.Title>
 * </Callout.Root>
 *
 * <Callout.Root tone="accent" icon="info-circle">
 *   <Callout.Title>Le catalogue repond</Callout.Title>
 *   <Callout.Detail>12 modules</Callout.Detail>
 * </Callout.Root>
 * ```
 */
const Callout = { Root, Media, Title, Detail, Actions };

export type { CalloutRootProps, CalloutTone };
export { Callout };
