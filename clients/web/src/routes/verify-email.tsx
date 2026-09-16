import { useT } from '@kromatv/ui';
import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { TokenScreen, useTokenLink } from '#web/features/accounts/token-page';
import { useAuth } from '#web/shared/lib/auth';

// Public email-verification page. An admin mints a verification and the link
// arrives by email (or by hand); confirming proves the mailbox is reachable.
// Confirming is an explicit button, never the bare GET: mail scanners prefetch
// links, and a prefetch must not verify anything. The AuthGate is bypassed on
// this path so a signed-out user can reach it. When the kroma.tv relay sent the
// browser here with `consent`, the question is this server's to ask and the
// answer is the relay's to keep: the button posts the blob to the relay, which
// records the yes and sends the browser back here to finish the verification.
export const Route = createFileRoute('/verify-email')({
  validateSearch: (s: Record<string, unknown>): { token?: string; consent?: string } => ({
    token: typeof s.token === 'string' ? s.token : undefined,
    consent: typeof s.consent === 'string' && s.consent ? s.consent : undefined,
  }),
  component: VerifyEmailPage,
});

function postConsent(relayUrl: string, consent: string) {
  const form = document.createElement('form');
  form.method = 'post';
  form.action = `${relayUrl}/confirm/${encodeURIComponent(consent)}`;
  document.body.appendChild(form);
  form.submit();
}

function VerifyEmailPage() {
  const t = useT();
  const { token, consent } = Route.useSearch();
  const { client } = useAuth();
  const [relay, setRelay] = useState<{ url: string; serverName: string } | null>(null);

  useEffect(() => {
    if (!consent) return;
    let cancelled = false;
    client.accounts
      .config()
      .then((cfg) => {
        if (cancelled || !cfg.mailRelayUrl) return;
        setRelay({ url: cfg.mailRelayUrl, serverName: cfg.serverName ?? 'KROMA' });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [client, consent]);

  const link = useTokenLink(token, (tok) => client.accounts.checkEmailVerification(tok));
  const asking = Boolean(consent && relay);
  let submitLabel = t('auth.verifySubmit');
  if (asking) submitLabel = t('auth.consentSubmit');
  else if (link.busy) submitLabel = t('common.saving');
  const submit = () => {
    if (!token) return;
    if (consent && relay) {
      postConsent(relay.url, consent);
      return;
    }
    void link.run(() => client.accounts.confirmEmailVerification(token), t('auth.verifyFailed'));
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
        title: asking
          ? t('auth.consentTitle', { name: relay?.serverName ?? '' })
          : t('auth.verifyTitle'),
        submit: submitLabel,
      }}
    />
  );
}
