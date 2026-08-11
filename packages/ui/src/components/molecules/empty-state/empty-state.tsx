import type { ReactNode } from 'react';
import { Box } from '#ui/components/atoms/box';
import { Icon, type IconName } from '#ui/components/atoms/icon';
import { Txt } from '#ui/components/atoms/text';
import { styles } from '#ui/core';

interface EmptyStateProps {
  icon: IconName;
  title: string;
  hint?: string;
  /** The raw cause, when there is one worth showing: an error message, a
   *  path. Set apart in a chip under the hint, the way the error pages do. */
  detail?: string;
  action?: ReactNode;
  tv?: boolean;
  /**
   * The state stands in for a LIST inside a section, not for a page: it sits
   * straight under whatever introduced it, with a smaller badge and a title
   * sized to a section rather than a screen. The page shape hangs 64pt below
   * its heading and titles at page scale, which under a segmented control
   * reads as a second, louder headline halfway down an empty screen.
   */
  compact?: boolean;
  /**
   * The state IS the page: it fills the space it was given and centres in it,
   * rather than hanging below whatever came before. For a whole screen with
   * nothing on it (a module that failed to load), where the default top offset
   * strands the message against a large empty area.
   */
  fill?: boolean;
}

// Where the state sits: the only thing `fill` decides, and the only thing the
// three shapes below share an answer for.
function placement(tv: boolean, fill: boolean, compact: boolean) {
  const flex = fill ? 1 : undefined;
  const justify = fill ? ('center' as const) : undefined;
  if (compact) return { flex, justify, mt: 24, py: 0 };
  if (fill) return { flex, justify, mt: 0, py: 64 };
  return { flex, justify, mt: TOP_OFFSET[tv ? 'tv' : 'page'], py: 0 };
}

function shapeOf(tv: boolean, compact: boolean) {
  if (compact) return SHAPES.compact;
  return tv ? SHAPES.tv : SHAPES.page;
}

// Every measure the shapes disagree on, resolved in one place so the tree below
// reads as a layout rather than as a column of ternaries.
function metrics(tv: boolean, fill: boolean, compact: boolean) {
  return { ...placement(tv, fill, compact), ...shapeOf(tv, compact) };
}

function EmptyState({
  icon,
  title,
  hint,
  detail,
  action,
  tv = false,
  fill = false,
  compact = false,
}: Readonly<EmptyStateProps>) {
  const m = metrics(tv, fill, compact);
  return (
    <Box center flex={m.flex} justify={m.justify} mt={m.mt} py={m.py} gap={m.gap}>
      <Box center w={m.badge} h={m.badge} radius="circle" bg="tint/5" border="tint/8">
        <Icon name={icon} size={m.glyph} color="textDim" />
      </Box>
      <Txt variant={m.titleVariant} style={[s.centred, m.titleStyle]}>
        {title}
      </Txt>
      {hint ? (
        <Txt variant="body" color="textMuted" style={[s.centred, m.hintStyle]}>
          {hint}
        </Txt>
      ) : null}
      {detail ? (
        <Box bg="surface1" border="border" radius="md" px={14} py={10} maxW={420}>
          <Txt variant="meta" color="textDim" style={s.centred}>
            {detail}
          </Txt>
        </Box>
      ) : null}
      {action ? <Box mt={m.actionMt}>{action}</Box> : null}
    </Box>
  );
}

// How far a state that follows content hangs below it. `fill` sets this to 0
// and centres instead.
const TOP_OFFSET = { page: 64, tv: 96 } as const;

const s = styles({
  centred: { textAlign: 'center' },
  title: { mt: 6 },
  titleCompact: { mt: 2, fontWeight: '700' },
  hint: { fontSize: 14.5, lineHeight: 22, maxW: 420 },
  hintTv: { maxW: 720 },
});

// A section's worth, a screen's worth, and a screen's worth at ten feet.
const SHAPES = {
  compact: {
    gap: 8,
    badge: 56,
    glyph: 24,
    titleVariant: 'body' as const,
    titleStyle: s.titleCompact,
    hintStyle: s.hint,
    actionMt: 6,
  },
  page: {
    gap: 10,
    badge: 64,
    glyph: 26,
    titleVariant: 'title' as const,
    titleStyle: s.title,
    hintStyle: s.hint,
    actionMt: 6,
  },
  tv: {
    gap: 16,
    badge: 88,
    glyph: 40,
    titleVariant: 'h2' as const,
    titleStyle: null,
    hintStyle: s.hintTv,
    actionMt: 8,
  },
};

export type { EmptyStateProps };
export { EmptyState };
