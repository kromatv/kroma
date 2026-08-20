import type { StoredSession } from '@kroma/core';
import { type ActivateResult, useT } from '@kroma/ui';
import { Box, Spinner as BusyRing, Button, OtpField, Row, Text } from '@kroma/ui/kit';
import { type CSSProperties, type ReactNode, useEffect, useState } from 'react';
import { UserAvatar } from '#web/shared/ui/user-avatar';

// Declared in styles.css, so the rejected PIN shakes without a keyframe the
// vocabulary has no spelling for.
const SHAKE: CSSProperties = { animation: 'otp-shake 0.4s ease' };

export function PinEntry({
  account,
  onBack,
  onSubmit,
  onExpired,
}: Readonly<{
  account: StoredSession;
  onBack: () => void;
  onSubmit: (pin: string) => Promise<ActivateResult>;
  onExpired: () => void;
}>) {
  const t = useT();
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(0);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  const locked = busy || cooldown > 0;

  const submit = async (value: string) => {
    if (locked) return;
    setBusy(true);
    setError(null);
    const r = await onSubmit(value);
    setBusy(false);
    if (r.ok) return; // the gate unmounts on success
    // Dead token, not a wrong PIN: a PIN can't fix it, so route to a full re-login.
    if (!r.needsPin) {
      onExpired();
      return;
    }
    setPin('');
    if (r.retryAfter) setCooldown(r.retryAfter);
    setError(r.error || t('auth.pinIncorrect'));
    setShake((n) => n + 1);
  };

  let status: ReactNode = null;
  if (busy) {
    status = (
      <>
        <BusyRing size={16} thickness={2} />
        <Text variant="meta" color="textMuted">
          {t('pin.verifying')}
        </Text>
      </>
    );
  } else if (error) {
    status = (
      <Text variant="meta" color="danger">
        {cooldown > 0 ? t('pin.lockedRetry', { seconds: cooldown }) : error}
      </Text>
    );
  }

  return (
    <Box w="100%" maxW={360} align="center" gap={24}>
      <UserAvatar
        name={account.user.username}
        avatarUrl={account.user.avatarUrl}
        seed={account.user.id}
        size={96}
      />
      <Text variant="h2">{account.user.username}</Text>
      <Text variant="meta" color="textMuted">
        {t('pin.verifySubtitle')}
      </Text>

      {/* key={shake} remounts the row so the shake animation replays each error. */}
      <div key={shake} style={shake ? SHAKE : undefined}>
        <OtpField.Root
          maxLength={4}
          value={pin}
          onValueChange={(v) => {
            setError(null);
            setPin(v);
          }}
          onComplete={(value) => void submit(value)}
          mask
          physicalKeyboard
          autoFocus
          disabled={locked}
          label={t('account.currentPin')}
        />
      </div>

      <Row h={20} gap={8}>
        {status}
      </Row>

      <Button
        variant="ghost"
        size="sm"
        icon="chevron-left"
        label={t('common.back')}
        onPress={onBack}
      />
    </Box>
  );
}
