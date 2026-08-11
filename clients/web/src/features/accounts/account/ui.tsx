// Shared building blocks for the account settings page (`/account`): the
// icon-led preference row, the password-strength estimate, and the small
// async-save state machine every section reuses.

import { apiErrorText, type MessageKey } from '@kroma/core';
import { useT } from '@kroma/ui';
import { type ColorValue, type IconName, IconWell, ListRow, Text } from '@kroma/ui/kit';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

/** A preference row inside a {@link ListRow.Group}: an amber-tinted glyph, a
 * label with a muted description, and a right-aligned control. */
export function PrefRow({
  icon,
  label,
  desc,
  control,
}: Readonly<{ icon: IconName; label: string; desc: string; control: ReactNode }>) {
  return (
    <ListRow.Root size="md" label={label} hint={desc}>
      <ListRow.Leading>
        <IconWell name={icon} size="sm" tone="accent" />
      </ListRow.Leading>
      <ListRow.Trailing>{control}</ListRow.Trailing>
    </ListRow.Root>
  );
}

export type Strength = {
  score: 0 | 1 | 2 | 3 | 4;
  value: number;
  color: ColorValue;
  labelKey: MessageKey | null;
};

/** A rough password-strength estimate for the meter: one point each for length
 * (8+), mixed case, a digit and a symbol. Purely a UI hint the server enforces
 * the real minimum. */
export function passwordStrength(pw: string): Strength {
  if (!pw) return { score: 0, value: 0, color: 'transparent', labelKey: null };
  let s = 0;
  if (pw.length >= 8) s += 1;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s += 1;
  if (/\d/.test(pw)) s += 1;
  if (/[^A-Za-z0-9]/.test(pw)) s += 1;
  const score = Math.max(1, s) as 1 | 2 | 3 | 4;
  const map = {
    1: { value: 0.25, color: 'danger', labelKey: 'account.passwordStrengthWeak' },
    2: { value: 0.5, color: 'accent', labelKey: 'account.passwordStrengthFair' },
    3: { value: 0.75, color: 'info', labelKey: 'account.passwordStrengthGood' },
    4: { value: 1, color: 'success', labelKey: 'account.passwordStrengthStrong' },
  } as const;
  return { score, ...map[score] };
}

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

/** Async-save state machine: `run(fn, fallbackMsg)` flips to `saving`, then
 * `saved` (auto-clearing after ~2.5s) or `error` with the server's message. */
export function useSave() {
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const run = useCallback(async (fn: () => Promise<void>, fallback: string) => {
    if (timer.current) clearTimeout(timer.current);
    setStatus('saving');
    setError(null);
    try {
      await fn();
      setStatus('saved');
      timer.current = setTimeout(() => setStatus('idle'), 2500);
    } catch (e) {
      setError(apiErrorText(e, fallback));
      setStatus('error');
    }
  }, []);

  return { status, error, run };
}

/** Inline saved ✓ / error text next to a section's save button. */
export function StatusText({
  status,
  error,
}: Readonly<{ status: SaveStatus; error: string | null }>) {
  const t = useT();
  if (status === 'saved')
    return (
      <Text variant="meta" color="accent">
        {t('common.saved')}
      </Text>
    );
  if (status === 'error')
    return (
      <Text variant="meta" color="danger">
        {error}
      </Text>
    );
  return null;
}
