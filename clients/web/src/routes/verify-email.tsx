import { useT } from '@kromatv/ui';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { TokenScreen, useTokenLink } from '#web/features/accounts/token-page';
import { useAuth } from '#web/shared/lib/auth';

// Public email-verification page. An admin mints a verification and the link
// arrives by email (or by hand); confirming proves the mailbox is reachable.
// Confirming is an explicit button, never the bare GET: mail scanners prefetch
// links, and a prefetch must not verify anything. The AuthGate is bypassed on
// this path so a signed-out user can reach it. When the kroma.tv relay's
// consent page sent the browser here, `grant` is what it minted: it rides
// along with the confirmation and the server keeps it for this address. It is
// read once and taken off the address bar, so neither history nor a Referer
// carries it further.
export const Route = createFileRoute('/verify-email')({
  validateSearch: (s: Record<string, unknown>): { token?: string; grant?: string } => ({
    token: typeof s.token === 'string' ? s.token : undefined,
    grant: typeof s.grant === 'string' && s.grant ? s.grant : undefined,
  }),
  component: VerifyEmailPage,
});

function VerifyEmailPage() {
  const t = useT();
  const { token, grant: grantInUrl } = Route.useSearch();
  const [grant] = useState(grantInUrl);
  const navigate = useNavigate();
  const { client } = useAuth();

  useEffect(() => {
    if (!grantInUrl) return;
    void navigate({ to: '/verify-email', search: { token }, replace: true });
  }, [grantInUrl, token, navigate]);

  const link = useTokenLink(token, (tok) => client.accounts.checkEmailVerification(tok));
  const submit = () => {
    if (!token) return;
    void link.run(
      () => client.accounts.confirmEmailVerification(token, grant),
      t('auth.verifyFailed'),
    );
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
