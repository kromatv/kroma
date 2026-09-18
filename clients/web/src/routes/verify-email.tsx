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
// browser here with `activate`, the owner is being asked to let this server
// send email through the relay: the page names the server by its host and the
// public address the relay saw it call from, and the button posts the blob to
// the relay, which records the yes and sends the browser back here to finish
// the verification of the owner's own address.
export const Route = createFileRoute('/verify-email')({
  validateSearch: (
    s: Record<string, unknown>,
  ): { token?: string; activate?: string; ip?: string } => ({
    token: typeof s.token === 'string' ? s.token : undefined,
    activate: typeof s.activate === 'string' && s.activate ? s.activate : undefined,
    ip: typeof s.ip === 'string' && s.ip ? s.ip : undefined,
  }),
  component: VerifyEmailPage,
});

function postActivation(relayUrl: string, activate: string) {
  const form = document.createElement('form');
  form.method = 'post';
  form.action = `${relayUrl}/confirm/${encodeURIComponent(activate)}`;
  document.body.appendChild(form);
  form.submit();
}

function VerifyEmailPage() {
  const t = useT();
  const { token, activate, ip } = Route.useSearch();
  const { client } = useAuth();
  const [relay, setRelay] = useState<{ url: string; serverName: string } | null>(null);

  useEffect(() => {
    if (!activate) return;
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
  }, [client, activate]);

  const link = useTokenLink(token, (tok) => client.accounts.checkEmailVerification(tok));
  const asking = Boolean(activate && relay);
  let submitLabel = t('auth.verifySubmit');
  if (asking) submitLabel = t('auth.activateSubmit');
  else if (link.busy) submitLabel = t('common.saving');
  const host = typeof window === 'undefined' ? '' : window.location.host;
  let detail = link.username;
  if (asking) {
    detail = ip ? t('auth.activateServer', { host, ip }) : t('auth.activateServerNoIp', { host });
  }
  const submit = () => {
    if (!token) return;
    if (activate && relay) {
      postActivation(relay.url, activate);
      return;
    }
    void link.run(() => client.accounts.confirmEmailVerification(token), t('auth.verifyFailed'));
  };

  return (
    <TokenScreen
      status={link.status}
      username={detail}
      error={link.error}
      busy={link.busy}
      onSubmit={submit}
      copy={{
        invalidTitle: t('auth.verifyInvalidTitle'),
        invalidDesc: t('auth.verifyInvalidDesc'),
        doneTitle: t('auth.verifyDoneTitle'),
        doneDesc: t('auth.verifyDoneDesc'),
        title: asking
          ? t('auth.activateTitle', { name: relay?.serverName ?? '' })
          : t('auth.verifyTitle'),
        submit: submitLabel,
      }}
    />
  );
}
