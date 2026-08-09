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
   * The state IS the page: it fills the space it was given and centres in it,
   * rather than hanging below whatever came before. For a whole screen with
   * nothing on it (a module that failed to load), where the default top offset
   * strands the message against a large empty area.
   */
  fill?: boolean;
}

// Every measure the two shapes disagree on, resolved in one place so the tree
// below reads as a layout rather than as a column of ternaries.
function metrics(tv: boolean, fill: boolean) {
  const offset = TOP_OFFSET[tv ? 'tv' : 'page'];
  return {
    flex: fill ? 1 : undefined,
    justify: fill ? ('center' as const) : undefined,
    mt: fill ? 0 : offset,
    py: fill ? 64 : 0,
    gap: tv ? 16 : 10,
    badge: tv ? 88 : 64,
    glyph: tv ? 40 : 26,
    titleVariant: tv ? ('h2' as const) : ('title' as const),
    titleStyle: tv ? null : s.title,
    hintStyle: tv ? s.hintTv : s.hint,
    actionMt: tv ? 8 : 6,
  };
}

function EmptyState({
  icon,
  title,
  hint,
  detail,
  action,
  tv = false,
  fill = false,
}: Readonly<EmptyStateProps>) {
  const m = metrics(tv, fill);
  return (
    <Box center flex={m.flex} justify={m.justify} mt={m.mt} py={m.py} gap={m.gap}>
      <Box center w={m.badge} h={m.badge} radius="pill" bg="white/5" border="white/8">
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
  hint: { fontSize: 14.5, lineHeight: 22, maxW: 420 },
  hintTv: { maxW: 720 },
});

export type { EmptyStateProps };
export { EmptyState };
