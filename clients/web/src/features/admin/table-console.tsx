// Shared building blocks for the admin "console" pages (Pipeline + Requests
// queue). Both render the same searchable table shell: a search box, filter
// chips, column heads, a count summary, a floating toast and an event-driven,
// throttled reload. These live here once instead of being copy/pasted per page.

import {
  Box,
  type ColorValue,
  color,
  Field,
  IconButton,
  Chip as KitChip,
  Row,
  Text,
} from '@kroma/ui/kit';
import { type CSSProperties, useCallback, useRef, useState } from 'react';

/** Coalesce event-driven reloads to at most one call per 1.5 s. */
export function useThrottledReload(reload: () => void): () => void {
  const lastReloadRef = useRef(0);
  return useCallback(() => {
    const now = Date.now();
    if (now - lastReloadRef.current < 1500) return;
    lastReloadRef.current = now;
    reload();
  }, [reload]);
}

/** Toast state + a `flash(text)` helper that shows it for 2.8 s. */
export function useConsoleToast(): {
  toast: { text: string; on: boolean };
  flash: (text: string) => void;
} {
  const [toast, setToast] = useState<{ text: string; on: boolean }>({ text: '', on: false });
  const flash = (text: string) => {
    setToast({ text, on: true });
    window.setTimeout(() => setToast((s) => ({ ...s, on: false })), 2800);
  };
  return { toast, flash };
}

/** The header search box with a clear button. */
export function ConsoleSearch({
  value,
  onChange,
  placeholder,
}: Readonly<{ value: string; onChange: (v: string) => void; placeholder: string }>) {
  return (
    <Box w={320} maxW="100%">
      <Field.Root label={placeholder} hideLabel>
        <Field.Input
          type="search"
          icon="search"
          placeholder={placeholder}
          value={value}
          onValueChange={onChange}
          trailing={
            value ? (
              <IconButton
                variant="ghost"
                diameter={28}
                glyph={16}
                icon="x"
                onPress={() => onChange('')}
              />
            ) : null
          }
        />
      </Field.Root>
    </Box>
  );
}

/** The "N tracked · M need action" summary line above the table. */
export function ConsoleSummary({
  total,
  totalLabel,
  accent,
  accentLabel,
}: Readonly<{ total: number; totalLabel: string; accent: number; accentLabel: string }>) {
  return (
    <Text variant="label" color="textDim" mt={6} mb={20}>
      <Text variant="label">{total.toLocaleString()}</Text> {totalLabel} ·{' '}
      <Text variant="label" color="accentText">
        {accent.toLocaleString()}
      </Text>{' '}
      {accentLabel}
    </Text>
  );
}

const BLUE_ACTIVE = { backgroundColor: color('info') } as const;

/** A filter chip on the kit pill. `tone` picks the active fill (defaults to the
 * amber accent; `blue` keeps the console's type-filter family). */
export function Chip({
  label,
  count,
  dot,
  on,
  tone = 'accent',
  onClick,
}: Readonly<{
  label: string;
  count?: number;
  dot?: ColorValue;
  on: boolean;
  tone?: 'accent' | 'blue';
  onClick: () => void;
}>) {
  return (
    <KitChip
      active={on}
      label={label}
      dot={dot}
      count={count}
      onPress={onClick}
      style={on && tone === 'blue' ? BLUE_ACTIVE : null}
    />
  );
}

// `position: fixed` and a translate have no React Native spelling, so the
// anchor stays a real element and only its contents speak the kit.
const TOAST_ANCHOR: CSSProperties = {
  position: 'fixed',
  bottom: 24,
  left: '50%',
  zIndex: 80,
  pointerEvents: 'none',
  transition: 'opacity var(--dur-base) var(--ease-out), transform var(--dur-base) var(--ease-out)',
};

/** The floating bottom-center toast, driven by `useConsoleToast`. */
export function ConsoleToast({ toast }: Readonly<{ toast: { text: string; on: boolean } }>) {
  return (
    <div
      style={{
        ...TOAST_ANCHOR,
        opacity: toast.on ? 1 : 0,
        transform: `translateX(-50%) translateY(${toast.on ? 0 : 12}px)`,
      }}
    >
      <Row gap={10} px={18} py={10} radius="pill" bg="surface2" border="borderStrong" shadow="pop">
        <Box w={8} h={8} shrink={0} radius="circle" bg="accent" />
        <Text variant="label">{toast.text}</Text>
      </Row>
    </div>
  );
}
