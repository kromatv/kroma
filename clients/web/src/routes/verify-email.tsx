import { useT } from '@kroma/ui';
import { createFileRoute } from '@tanstack/react-router';
import { TokenScreen, useTokenLink } from '#web/features/accounts/token-page';
import { useAuth } from '#web/shared/lib/auth';

// Public email-verification page. An admin mints a verification and the link
// arrives by email (or by hand); confirming proves the mailbox is reachable.
// Confirming is an explicit button, never the bare GET: mail scanners prefetch
// links, and a prefetch must not verify anything. The AuthGate is bypassed on
// this path so a signed-out user can reach it.
export const Route = createFileRoute('/verify-email')({
  validateSearch: (s: Record<string, unknown>): { token?: string } => ({
    token: typeof s.token === 'string' ? s.token : undefined,
  }),
  component: VerifyEmailPage,
});

function VerifyEmailPage() {
  const t = useT();
  const { token } = Route.useSearch();
  const { client } = useAuth();

  const link = useTokenLink(token, (tok) => client.checkEmailVerification(tok));
  const submit = () => {
    if (!token) return;
    void link.run(() => client.confirmEmailVerification(token), t('auth.verifyFailed'));
  };

  return (
    <TokenScreen
      status={link.status}
      username={link.username}
      error={link.error}
      busy={link.busy}
      onSubmit={submit}
      copy={{
        invalidTitle: t('auth.verifyInvalidTitle'),
        invalidDesc: t('auth.verifyInvalidDesc'),
        doneTitle: t('auth.verifyDoneTitle'),
        doneDesc: t('auth.verifyDoneDesc'),
        title: t('auth.verifyTitle'),
        submit: link.busy ? t('common.saving') : t('auth.verifySubmit'),
      }}
    />
  );
}
