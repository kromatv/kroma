// <NumberField>: the numeric entry, wearing exactly the well and rhythm a
// <Field> entry wears, plus a stacked stepper pair - the affordance that says
// "number", the pointer's way to nudge, and on a television the only way to
// change the value at all. The buffer is text (so a cleared field can be
// retyped), what is committed is always what is on screen, and blur
// normalizes: clamps to the bounds and rewrites the text to the number
// actually stored, so the field can never show 15 while holding 64.

import { useState } from 'react';
import { Box } from '#ui/components/atoms/box';
import { Focusable } from '#ui/components/atoms/focusable';
import { Icon, type IconName } from '#ui/components/atoms/icon';
import { TextField, type TextFieldProps } from '#ui/components/atoms/text-field';
import { styles } from '#ui/core';
import { bySize, type ControlSize, entryDefaultSize } from '#ui/lib/field-shell';
import { useStableCallback } from '#ui/lib/stable-callback';
import { useTDefault } from '#ui/services/i18n';

interface NumberFieldProps
  extends Omit<TextFieldProps, 'value' | 'defaultValue' | 'onValueChange' | 'type' | 'trailing'> {
  value: number;
  onValueChange: (next: number) => void;
  min?: number;
  max?: number;
  step?: number;
}

function clampTo(n: number, min?: number, max?: number): number {
  let out = n;
  if (min !== undefined) out = Math.max(min, out);
  if (max !== undefined) out = Math.min(max, out);
  return out;
}

/** `0.7 + 0.1` is `0.7999...`; a step's own decimal places say how far to round. */
function snapTo(n: number, step: number): number {
  const decimals = (String(step).split('.')[1] ?? '').length;
  return Number(n.toFixed(decimals));
}

function NumberField({
  value,
  onValueChange,
  min,
  max,
  step,
  autoFocus = false,
  ...field
}: Readonly<NumberFieldProps>) {
  const t = useTDefault();
  const [text, setText] = useState(() => String(value));
  // Adjusted during render, not in an effect, so an outside change (a reset
  // button, a poll) lands without a frame of the stale number.
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    if (Number(text.trim()) !== value) setText(String(value));
  }

  const commit = (n: number) => {
    setSeen(n);
    if (n !== value) onValueChange(n);
  };

  const edit = (raw: string) => {
    setText(raw);
    const trimmed = raw.trim();
    if (trimmed === '') return;
    const n = Number(trimmed);
    if (Number.isNaN(n)) return;
    commit(n);
  };

  // The bounds apply when the entry SETTLES, not per keystroke: clamping '1'
  // to a min of 64 while someone is still typing '150' would store a number
  // the field never showed.
  const settle = () => {
    const n = Number(text.trim());
    const bounded = clampTo(Number.isNaN(n) || text.trim() === '' ? value : n, min, max);
    setText(String(bounded));
    commit(bounded);
  };

  // Stable: it is both steppers' `onPress`, and a fresh one per value
  // re-rendered the two buttons that had not changed.
  const nudge = useStableCallback((direction: -1 | 1) => {
    const by = step ?? 1;
    const bounded = clampTo(snapTo(value + direction * by, by), min, max);
    setText(String(bounded));
    commit(bounded);
  });

  return (
    <TextField
      {...field}
      type="number"
      autoFocus={autoFocus}
      value={text}
      onValueChange={edit}
      onBlur={settle}
      textStyle={TABULAR}
      trailing={
        <Box>
          <Step
            icon="chevron-up"
            size={field.size}
            label={t('common.increase')}
            disabled={max !== undefined && value >= max}
            onPress={() => nudge(1)}
          />
          <Step
            icon="chevron-down"
            size={field.size}
            label={t('common.decrease')}
            disabled={min !== undefined && value <= min}
            onPress={() => nudge(-1)}
          />
        </Box>
      }
      // A physical keyboard steps with the arrows, the way a native number
      // input does. On the container, where react-native-web delivers the
      // bubbled event from the focused entry.
      onKeyDown={(event) => {
        const key = event.nativeEvent.key;
        if (key === 'ArrowUp') nudge(1);
        else if (key === 'ArrowDown') nudge(-1);
      }}
    />
  );
}

function Step({
  icon,
  size,
  label,
  disabled,
  onPress,
}: Readonly<{
  icon: IconName;
  size?: ControlSize;
  label: string;
  disabled: boolean;
  onPress: () => void;
}>) {
  return (
    <Focusable
      label={label}
      disabled={disabled}
      onPress={onPress}
      ring="focusEdge"
      style={[s.step, s[size ?? entryDefaultSize()]]}
      states={STEP_STATES}
    >
      <Icon name={icon} size={12} thickness={2.6} color={disabled ? 'text/25' : 'textMuted'} />
    </Focusable>
  );
}

const STEP_STATES = { hover: { bg: 'tint/10' } } as const;

// Digits that keep their width, so 99 -> 100 does not make the box breathe.
const TABULAR = { fontVariant: ['tabular-nums' as const] };

const s = styles({
  step: { w: 24, center: true, radius: 'xs' },
  ...bySize((m) => ({ h: Math.floor((m.line - 2) / 2) })),
});

export type { NumberFieldProps };
export { NumberField };
