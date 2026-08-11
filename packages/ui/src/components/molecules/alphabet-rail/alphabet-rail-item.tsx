import { Box } from '#ui/components/atoms/box';
import { Focusable } from '#ui/components/atoms/focusable';
import { Text } from '#ui/components/atoms/text';
import { type StyleDecl, svFor } from '#ui/core';
import { ROW_W, useAlphabetRail } from './alphabet-rail-context';

// The lens is the solid accent fill, so a dimmed letter under it keeps its
// ink but drops presence.
const INK_DIM = 'rgba(10, 10, 12, 0.4)';

const letterVariants = svFor<{ root: StyleDecl; label: StyleDecl }>()({
  slots: {
    root: { align: 'center', justify: 'center', radius: 'pill' },
    label: { font: 'ui', fontWeight: '600' },
  },
  variants: {
    tone: {
      idle: { label: { color: 'textMuted', _hover: { color: 'text' } } },
      dim: { label: { color: 'tint/15' } },
      lit: { label: { color: 'accentInk' } },
      litDim: { label: { color: INK_DIM } },
    },
  },
  defaults: { tone: 'idle' },
});

type Tone = 'idle' | 'dim' | 'lit' | 'litDim';

function toneOf(index: number, present: boolean, lit: [number, number] | null): Tone {
  const inLens = lit !== null && index >= lit[0] && index <= lit[1];
  if (present) return inLens ? 'lit' : 'idle';
  return inLens ? 'litDim' : 'dim';
}

interface AlphabetItemProps {
  /** The bucket this row stands for: '#', 'A' … 'Z'. */
  value: string;
  /** A bucket the list does not carry. It renders dimmed and takes NO focus
   *  stop; a scrub or tap near it snaps to the nearest letter that is there. */
  disabled?: boolean;
  /** The accessible name of the jump, defaulting to the letter itself. */
  label?: string;
}

/** One letter of the rail. */
function Item({ value, disabled = false, label }: Readonly<AlphabetItemProps>) {
  const { indexOf, lit, rowH, fontSize, jump } = useAlphabetRail('Item');
  const tone = toneOf(indexOf(value), !disabled, lit);
  const box = { width: ROW_W, height: rowH };

  if (disabled) {
    return (
      <Box align="center" justify="center" style={box}>
        <Text aria-hidden selectable={false} style={[letterVariants({ tone }).label, { fontSize }]}>
          {value}
        </Text>
      </Box>
    );
  }

  return (
    <Focusable
      label={label ?? value}
      onPress={() => jump(value)}
      sv={letterVariants}
      vars={{ tone }}
      style={box}
    >
      {(state) => (
        <Text selectable={false} style={[state.slots.label, { fontSize }]}>
          {value}
        </Text>
      )}
    </Focusable>
  );
}

export type { AlphabetItemProps };
export { Item };
