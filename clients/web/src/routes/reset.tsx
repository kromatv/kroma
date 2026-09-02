import { useT } from '@kroma/ui';
import { Field } from '@kroma/ui/kit';
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { TokenScreen, useTokenLink } from '#web/features/accounts/token-page';
import { useAuth } from '#web/shared/lib/auth';

const CODE_LEN = 8;
const MIN_PASSWORD_LEN = 8;

// Public credential-reset page. An admin (with `users.manage`) mints a reset and
// shares `/reset?token=TOKEN`. The emailed link never carries more: the user also
// enters the one-time code the owner read to them, so intercepting the email
// gives nothing. A hand-copied link may embed the code (`&code=`), which just
// prefills the field. The global AuthGate is bypassed on this path so a
// locked-out user can reach it.
export const Route = createFileRoute('/reset')({
  validateSearch: (s: Record<string, unknown>): { token?: string; code?: string } => ({
    token: typeof s.token === 'string' ? s.token : undefined,
    code: typeof s.code === 'string' ? s.code : undefined,
  }),
  component: ResetPage,
});

function ResetPage() {
  const t = useT();
  const { token, code: codeFromUrl } = Route.useSearch();
  const { client } = useAuth();

  const [code, setCode] = useState(codeFromUrl ?? '');
  const [password, setPassword] = useState('');
  const link = useTokenLink(token, (tok) => client.checkReset(tok));

  const ready = code.trim().length === CODE_LEN && password.length >= MIN_PASSWORD_LEN;
  const submit = () => {
    if (!ready || !token) return;
    void link.run(() => client.redeemReset(token, code.trim(), password), t('auth.resetFailed'));
  };

  return (
    <TokenScreen
      status={link.status}
      username={link.username}
      error={link.error}
      busy={link.busy}
      disabled={!ready}
      onSubmit={submit}
      copy={{
        invalidTitle: t('auth.resetInvalidTitle'),
        invalidDesc: t('auth.resetInvalidDesc'),
        doneTitle: t('auth.resetDoneTitle'),
        doneDesc: t('auth.resetDoneDesc'),
        title: t('auth.resetTitle'),
        submit: link.busy ? t('common.saving') : t('auth.resetSubmit'),
      }}
    >
      <Field.Root w="100%" size="md" label={t('auth.resetCode')} hideLabel>
        <Field.Input
          lift
          icon="key"
          placeholder={t('auth.resetCode')}
          value={code}
          onValueChange={setCode}
          autoComplete="one-time-code"
        />
      </Field.Root>
      <Field.Root w="100%" size="md" label={t('auth.newPassword')} hideLabel>
        <Field.Input
          lift
          type="password"
          icon="lock"
          placeholder={t('auth.newPassword')}
          value={password}
          onValueChange={setPassword}
          autoComplete="new-password"
          autoFocus={Boolean(codeFromUrl)}
        />
      </Field.Root>
    </TokenScreen>
  );
}
