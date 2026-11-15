import { useT } from '@kromatv/ui';
import { Box, Dialog, Field, Progress, Row, Text } from '@kromatv/ui/kit';
import { useState } from 'react';
import { passwordStrength, useSave } from '#web/features/accounts/account/ui';
import { useAuth } from '#web/shared/lib/auth';

/** Changes the account's password: the current one to prove who is asking, the
 * new one with how strong it is, and the new one again. */
export function PasswordDialog({ onClose }: Readonly<{ onClose: () => void }>) {
  const t = useT();
  const { client } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const save = useSave();

  const strength = passwordStrength(next);
  const mismatch = confirm.length > 0 && next !== confirm;
  const valid = current.length > 0 && next.length >= 4 && confirm.length > 0 && !mismatch;
  const busy = save.status === 'saving';

  const submit = (e?: React.SyntheticEvent) => {
    e?.preventDefault();
    if (!valid || busy) return;
    void save.run(async () => {
      await client.accounts.changePassword(current, next);
      onClose();
    }, t('account.saveFailed'));
  };

  return (
    <Dialog.Root
      open
      title={t('account.updatePassword')}
      description={t('auth.passwordHint')}
      width="sm"
      onClose={busy ? () => {} : onClose}
    >
      <form onSubmit={submit}>
        <Box gap={18}>
          <Field.Root
            label={t('account.currentPassword')}
            error={save.status === 'error' ? (save.error ?? undefined) : undefined}
          >
            <Field.Input
              type="password"
              icon="lock"
              value={current}
              onValueChange={setCurrent}
              autoComplete="current-password"
              autoFocus
            />
          </Field.Root>
          <Box gap={10}>
            <Field.Root label={t('account.newPassword')}>
              <Field.Input
                type="password"
                icon="key"
                value={next}
                onValueChange={setNext}
                autoComplete="new-password"
              />
            </Field.Root>
            <Row gap={10}>
              <Box flex>
                <Progress
                  value={strength.value}
                  color={strength.color}
                  trackColor="tint/10"
                  thickness={5}
                  rounded
                />
              </Box>
              {strength.labelKey ? (
                <Text variant="meta" color={strength.color} minW={54} textAlign="right">
                  {t(strength.labelKey)}
                </Text>
              ) : null}
            </Row>
          </Box>
          <Field.Root
            label={t('account.confirmPassword')}
            error={mismatch ? t('account.passwordMismatch') : undefined}
          >
            <Field.Input
              type="password"
              icon="key"
              value={confirm}
              onValueChange={setConfirm}
              autoComplete="new-password"
            />
          </Field.Root>
        </Box>
      </form>
      <Dialog.Actions
        onCancel={onClose}
        cancelLabel={t('common.cancel')}
        onConfirm={() => submit()}
        confirmLabel={t('account.updatePassword')}
        busy={busy}
        disabled={!valid}
      />
    </Dialog.Root>
  );
}
