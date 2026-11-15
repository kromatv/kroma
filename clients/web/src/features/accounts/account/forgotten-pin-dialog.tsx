import { apiErrorText } from '@kromatv/client';
import { useT } from '@kromatv/ui';
import { Dialog, Field } from '@kromatv/ui/kit';
import { useState } from 'react';
import { useAuth } from '#web/shared/lib/auth';

/** Turns the profile lock off for someone who no longer knows the PIN: the
 * account's password proves who is asking. */
export function ForgottenPinDialog({ onClose }: Readonly<{ onClose: () => void }>) {
  const t = useT();
  const { client, updateUser } = useAuth();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e?: React.SyntheticEvent) => {
    e?.preventDefault();
    if (!password || busy) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { user } = await client.accounts.clearPinWithPassword(password);
      updateUser({ hasPin: user.hasPin });
      onClose();
    } catch (e) {
      setError(apiErrorText(e, t('account.saveFailed')));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog.Root
      open
      title={t('account.pinForgotTitle')}
      description={t('account.pinForgotHint')}
      width="sm"
      onClose={busy ? () => {} : onClose}
    >
      <form onSubmit={submit}>
        <Field.Root label={t('account.currentPassword')} error={error ?? undefined}>
          <Field.Input
            type="password"
            icon="lock"
            value={password}
            onValueChange={setPassword}
            autoComplete="current-password"
            autoFocus
          />
        </Field.Root>
      </form>
      <Dialog.Actions
        onCancel={onClose}
        cancelLabel={t('common.cancel')}
        onConfirm={() => void submit()}
        confirmLabel={t('account.pinForgotConfirm')}
        busy={busy}
        disabled={!password}
      />
    </Dialog.Root>
  );
}
