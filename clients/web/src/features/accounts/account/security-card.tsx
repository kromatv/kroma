// The server has no mail service, so there is no email-based reset flow: this
// self-service change is how an account rotates its own password.

import { useT } from '@kroma/ui';
import { Box, Button, Field, Progress, Row, Surface, Text } from '@kroma/ui/kit';
import { useState } from 'react';
import { passwordStrength, StatusText, useSave } from '#web/features/accounts/account/ui';
import { useAuth } from '#web/shared/lib/auth';

export function SecurityCard() {
  const t = useT();
  const { client } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const save = useSave();

  const strength = passwordStrength(next);
  const mismatch = confirm.length > 0 && next !== confirm;
  const valid = current.length > 0 && next.length >= 4 && confirm.length > 0 && !mismatch;

  const submit = (e?: React.SyntheticEvent) => {
    e?.preventDefault();
    if (!valid) return;
    save.run(async () => {
      await client.changePassword(current, next);
      setCurrent('');
      setNext('');
      setConfirm('');
    }, t('account.saveFailed'));
  };

  return (
    <Surface elevated pad="none" p={22} radius="lg" border="border">
      <Text variant="label" font="display">
        {t('account.updatePassword')}
      </Text>
      <Text variant="meta" color="textMuted" mt={4} mb={18}>
        {t('auth.passwordHint')}
      </Text>

      <form onSubmit={submit}>
        <Box gap={18}>
          <Box maxW={{ base: '100%', md: '50%' }}>
            <Field.Root label={t('account.currentPassword')}>
              <Field.Input
                type="password"
                placeholder="••••••••"
                value={current}
                onValueChange={setCurrent}
              />
            </Field.Root>
          </Box>

          <Box row={{ base: false, md: true }} gap={18}>
            <Box flex gap={10}>
              <Field.Root label={t('account.newPassword')}>
                <Field.Input
                  type="password"
                  placeholder="••••••••"
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

            <Box flex>
              <Field.Root
                label={t('account.confirmPassword')}
                error={mismatch ? t('account.passwordMismatch') : undefined}
              >
                <Field.Input
                  type="password"
                  placeholder="••••••••"
                  value={confirm}
                  onValueChange={setConfirm}
                  autoComplete="new-password"
                />
              </Field.Root>
            </Box>
          </Box>

          <Row gap={12}>
            <Button
              size="sm"
              icon="device-floppy"
              label={save.status === 'saving' ? t('common.saving') : t('account.updatePassword')}
              onPress={submit}
              loading={save.status === 'saving'}
              disabled={!valid}
            />
            <StatusText status={save.status} error={save.error} />
          </Row>
        </Box>
      </form>
    </Surface>
  );
}
