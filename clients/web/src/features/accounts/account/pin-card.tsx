// Set / change / remove the account's profile-lock PIN, which gates switching
// into this profile on a shared device. It is not the login credential.

import { useT } from '@kroma/ui';
import { Box, Button, IconWell, OtpField, Row, Surface, Text } from '@kroma/ui/kit';
import { useState } from 'react';
import { StatusText, useSave } from '#web/features/accounts/account/ui';
import { useAuth } from '#web/shared/lib/auth';

function PinRow({
  label,
  value,
  onChange,
}: Readonly<{ label: string; value: string; onChange: (v: string) => void }>) {
  return (
    <Box gap={8}>
      <Text variant="overline" color="textDim">
        {label}
      </Text>
      <OtpField.Root
        maxLength={4}
        value={value}
        onValueChange={onChange}
        mask
        physicalKeyboard
        label={label}
      />
    </Box>
  );
}

export function PinCard() {
  const t = useT();
  const { user, client, updateUser } = useAuth();
  const [current, setCurrent] = useState('');
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [mismatch, setMismatch] = useState(false);
  const save = useSave();
  const remove = useSave();

  if (!user) return null;
  const hasPin = user.hasPin;
  const submitLabel = hasPin ? t('account.changePin') : t('account.setPin');

  const reset = () => {
    setCurrent('');
    setPin('');
    setConfirm('');
  };

  // The event is optional: the form's Enter submit passes one, the button none.
  const submit = (e?: React.SyntheticEvent) => {
    e?.preventDefault();
    if (pin.length !== 4 || (hasPin && current.length !== 4)) return;
    if (pin !== confirm) {
      setMismatch(true);
      return;
    }
    setMismatch(false);
    save.run(async () => {
      const { user: u } = await client.setPin(pin, hasPin ? current : undefined);
      updateUser({ hasPin: u.hasPin });
      reset();
    }, t('account.saveFailed'));
  };

  const removePin = () => {
    if (current.length !== 4) return;
    remove.run(async () => {
      const { user: u } = await client.clearPin(current);
      updateUser({ hasPin: u.hasPin });
      reset();
    }, t('account.saveFailed'));
  };

  return (
    <Surface elevated pad="none" p={22} radius="lg" border="border">
      <Row gap={14} mb={16}>
        <IconWell name="lock" size="sm" tone="accent" />
        <Box minW={0}>
          <Text variant="label" font="display">
            {t('account.pin')}
          </Text>
          <Text variant="meta" color="textMuted" mt={2}>
            {hasPin ? t('account.pinSubSet') : t('account.pinSub')}
          </Text>
        </Box>
      </Row>

      <form onSubmit={submit}>
        <Box gap={16}>
          {hasPin ? (
            <PinRow label={t('account.currentPin')} value={current} onChange={setCurrent} />
          ) : null}
          <PinRow
            label={hasPin ? t('account.newPin') : t('account.pin')}
            value={pin}
            onChange={setPin}
          />
          <PinRow label={t('account.confirmPin')} value={confirm} onChange={setConfirm} />
          <Row wrap gap={12}>
            <Button
              size="sm"
              label={save.status === 'saving' ? t('common.saving') : submitLabel}
              onPress={submit}
              loading={save.status === 'saving'}
              disabled={pin.length !== 4 || (hasPin && current.length !== 4)}
            />
            {hasPin ? (
              <Button
                variant="ghost"
                size="sm"
                label={remove.status === 'saving' ? t('common.saving') : t('account.removePin')}
                onPress={removePin}
                loading={remove.status === 'saving'}
                disabled={current.length !== 4}
              />
            ) : null}
            {mismatch ? (
              <Text variant="meta" color="danger">
                {t('account.pinMismatch')}
              </Text>
            ) : (
              <StatusText
                status={save.status === 'idle' ? remove.status : save.status}
                error={save.error ?? remove.error}
              />
            )}
          </Row>
        </Box>
      </form>
    </Surface>
  );
}
