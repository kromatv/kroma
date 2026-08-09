// The D-pad presentation of <Select>'s options: a <Dialog>, which on tvOS is
// its own view controller - the remote is confined to the options, and a
// popover anchored to the trigger would be clipped inside a ScrollView.

import { Box } from '#ui/components/atoms/box';
import { Focusable } from '#ui/components/atoms/focusable';
import { Icon } from '#ui/components/atoms/icon';
import { Txt } from '#ui/components/atoms/text';
import { Dialog } from '#ui/components/organisms/dialog';
import { sv } from '#ui/core';
import { FocusColumn } from '#ui/lib/focus-scope';
import type { SelectSurfaceProps } from './select-surface';

const optionVariants = sv({
  slots: {
    root: {
      row: true,
      align: 'center',
      gap: 12,
      px: 14,
      py: 12,
      radius: 'md',
      _hover: { bg: 'white/8' },
    },
    ink: { shrink: 1 },
  },
  variants: {
    chosen: { true: { ink: { color: 'text' } }, false: { ink: { color: 'textMuted' } } },
  },
  defaults: { chosen: false },
});

function SelectOptionsDialog({
  open,
  onClose,
  label,
  options,
  value,
  onPick,
}: Readonly<SelectSurfaceProps>) {
  return (
    <Dialog open={open} onClose={onClose} title={label} width={560}>
      <FocusColumn>
        {options.map((option) => (
          <Focusable
            key={option.value}
            role="option"
            selected={option.value === value}
            label={option.label}
            disabled={option.disabled}
            onPress={() => onPick(option.value)}
            sv={optionVariants}
            vars={{ chosen: option.value === value }}
          >
            {(state) => (
              <>
                {option.icon ? <Icon name={option.icon} size={18} color="textMuted" /> : null}
                <Txt variant="body" lines={1} style={state.slots.ink}>
                  {option.label}
                </Txt>
                <Box flex />
                {option.note ? (
                  <Txt variant="meta" color="textDim">
                    {option.note}
                  </Txt>
                ) : null}
                <Box w={18} align="center">
                  {option.value === value ? <Icon name="check" size={16} color="accent" /> : null}
                </Box>
              </>
            )}
          </Focusable>
        ))}
      </FocusColumn>
    </Dialog>
  );
}

export { optionVariants, SelectOptionsDialog };
