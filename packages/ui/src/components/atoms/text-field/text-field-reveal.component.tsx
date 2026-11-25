import { Box } from '#ui/components/atoms/box';
import { Focusable } from '#ui/components/atoms/focusable';
import { Icon } from '#ui/components/atoms/icon';
import { type StyleScope, sharedStyle, styles, useStyleScope } from '#ui/core';
import { useStyles } from '#ui/core/styles';
import { useTDefault } from '#ui/services/i18n';

const revealAt = (end: number, scope: StyleScope) =>
  sharedStyle(`text-field:reveal:${end}`, { end }, scope);

function RevealButton({
  revealed,
  onToggle,
  end,
}: Readonly<{ revealed: boolean; onToggle: () => void; end: number }>) {
  const scope = useStyleScope();

  const s = useStyles(sDefinition);
  const t = useTDefault();

  return (
    <Box absolute style={[s.revealSlot, revealAt(end, scope)]}>
      <Focusable
        label={revealed ? t('common.hidePassword') : t('common.showPassword')}
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
