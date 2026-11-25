import { Box } from '#ui/components/atoms/box';
import { Focusable } from '#ui/components/atoms/focusable';
import { Icon } from '#ui/components/atoms/icon';
import { type StyleScope, sharedStyle, styles, useStyleScope } from '#ui/core';
import { useStyles } from '#ui/core/styles';

const revealAt = (right: number, scope: StyleScope) =>
  sharedStyle(`text-field:reveal:${right}`, { right }, scope);

function RevealButton({
  revealed,
  onToggle,
  right,
}: Readonly<{ revealed: boolean; onToggle: () => void; right: number }>) {
  const scope = useStyleScope();

  const s = useStyles(sDefinition);

  return (
    <Box absolute style={[s.revealSlot, revealAt(right, scope)]}>
      <Focusable
        label={revealed ? 'Hide password' : 'Show password'}
        ring="inside"
        onPress={onToggle}
        style={s.reveal}
        states={REVEAL_STATES}
      >
        <Icon
          name={revealed ? 'eye-off' : 'eye'}
          size={REVEAL_SIZE}
          thickness={1.8}
          color="text/50"
        />
      </Focusable>
    </Box>
  );
}

const REVEAL_SIZE = 20;
const REVEAL_STATES = { hover: { bg: 'tint/10' } } as const;

const sDefinition = styles({
  revealSlot: { top: 0, bottom: 0, justify: 'center' },
  reveal: { p: 4, m: -4, radius: 'md' },
});

export { REVEAL_SIZE, RevealButton };
