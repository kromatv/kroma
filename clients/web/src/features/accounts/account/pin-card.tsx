// Set / change / remove the account's profile-lock PIN, which gates switching
// into this profile on a shared device. It is not the login credential.

import { useT } from '@kroma/ui';
import { Button, OtpField } from '@kroma/ui/kit';
import { IconLock } from '@tabler/icons-react';
import { useState } from 'react';
import { Panel, StatusText, useSave } from '#web/features/accounts/account/ui';
import { useAuth } from '#web/shared/lib/auth';

function PinRow({
  label,
  value,
  onChange,
}: Readonly<{ label: string; value: string; onChange: (v: string) => void }>) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-dim">{label}</span>
      <OtpField
        maxLength={4}
        value={value}
        onChange={onChange}
        mask
        physicalKeyboard
        label={label}
      />
    </div>
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
    <Panel className="p-5.5">
      <div className="mb-4 flex items-center gap-3.5">
        <span className="flex size-10 flex-none items-center justify-center rounded-md bg-accent-soft text-accent">
          <IconLock size={20} stroke={1.8} />
        </span>
        <div className="min-w-0">
          <div className="font-display text-[15px] font-bold text-text">{t('account.pin')}</div>
          <div className="mt-0.5 text-[12.5px] text-muted">
            {hasPin ? t('account.pinSubSet') : t('account.pinSub')}
          </div>
        </div>
      </div>

      <form onSubmit={submit} className="flex flex-col gap-4">
        {hasPin ? (
          <PinRow label={t('account.currentPin')} value={current} onChange={setCurrent} />
        ) : null}
        <PinRow
          label={hasPin ? t('account.newPin') : t('account.pin')}
          value={pin}
          onChange={setPin}
        />
        <PinRow label={t('account.confirmPin')} value={confirm} onChange={setConfirm} />
        <div className="flex flex-wrap items-center gap-3">
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
            <span className="text-[13px] font-medium text-danger">{t('account.pinMismatch')}</span>
          ) : (
            <StatusText
              status={save.status === 'idle' ? remove.status : save.status}
              error={save.error ?? remove.error}
            />
          )}
        </div>
      </form>
    </Panel>
  );
}
