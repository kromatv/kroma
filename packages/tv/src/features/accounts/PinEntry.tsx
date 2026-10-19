import { KromaApiError } from '@kromatv/client';
import type { MessageKey } from '@kromatv/i18n';
import { useT } from '@kromatv/ui';
import { Box, Keypad, PinField, type FocusHandle, Spinner, Text } from '@kromatv/ui/kit';
import { useEffect, useRef, useState } from 'react';
import { useEnv } from '#tv/app/providers/env';

const PIN_LENGTH = 4;

/** Whether a PIN call was refused for too many tries, which `PinEntry` answers with a countdown. */
export function isPinLockout(e: unknown): e is KromaApiError {
  return e instanceof KromaApiError && e.status === 429;
}

interface PinEntryProps {
  label: string;
  onSubmit: (pin: string) => Promise<MessageKey | undefined>;
  wrongKey: MessageKey;
  align?: 'center' | 'flex-start';
}

/** The PIN field, its status line and the remote's keypad. The fourth digit submits; a
 * key `onSubmit` returns is shown as the error, and anything it throws but a lockout as `wrongKey`. */
export function PinEntry({ label, onSubmit, wrongKey, align = 'center' }: Readonly<PinEntryProps>) {
  const t = useT();
  const { physicalKeyboard } = useEnv();
  const [buffer, setBuffer] = useState('');
  const [error, setError] = useState<MessageKey | ''>('');
  const [shake, setShake] = useState(0);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const blocked = busy || cooldown > 0;
  const pad = useRef<FocusHandle>(null);

  useEffect(() => {
    pad.current?.focus();
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  const fail = (key: MessageKey) => {
    setError(key);
    setShake((s) => s + 1);
  };

  const submit = async (pin: string) => {
    if (blocked) return;
    setError('');
    setBusy(true);
    try {
      const refused = await onSubmit(pin);
      if (refused) fail(refused);
    } catch (e) {
      if (isPinLockout(e)) {
        setCooldown(Number((e.body as { retryAfter?: number } | undefined)?.retryAfter ?? 30));
        fail('auth.pinLocked');
      } else {
        fail(wrongKey);
      }
    } finally {
      setBuffer('');
      setBusy(false);
    }
  };

  const edit = (next: (b: string) => string) => {
    if (blocked) return;
    setError('');
    setBuffer(next);
  };

  return (
    <Box align={align}>
      <Box key={shake} mt={32}>
        <PinField
          maxLength={PIN_LENGTH}
          value={buffer}
          onValueChange={(next) => edit(() => next)}
          onComplete={(pin) => void submit(pin)}
          disabled={busy}
          label={label}
          physicalKeyboard={physicalKeyboard}
        />
      </Box>

      <Box row align="center" gap={8} h={24}>
        {busy ? (
          <>
            <Spinner size={16} thickness={2} />
            <Text variant="label" color="textDim">
              {t('pin.verifying')}
            </Text>
          </>
        ) : null}
        {!busy && error ? (
          <Text variant="label" color="danger">
            {error === 'auth.pinLocked' && cooldown > 0
              ? t('pin.lockedRetry', { seconds: cooldown })
              : t(error)}
          </Text>
        ) : null}
      </Box>

      <Box mt={8}>
        <Keypad
          focusHandle={pad}
          onDigit={(d) => edit((b) => (b.length < PIN_LENGTH ? b + d : b))}
          onDelete={() => edit((b) => b.slice(0, -1))}
        />
      </Box>
    </Box>
  );
}
