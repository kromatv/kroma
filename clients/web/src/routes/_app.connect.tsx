import { useT } from '@kroma/ui';
import { Button, OtpField } from '@kroma/ui/kit';
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { NearbyTvs } from '#web/features/accounts/nearby-tvs';
import { useAuth } from '#web/shared/lib/auth';

// The approver side of pairing: the TVs waiting on this network are one tap
// each, and under them the code a TV shows for everything that road cannot
// reach. AuthGate guarantees the sign-in.
export const Route = createFileRoute('/_app/connect')({
  validateSearch: (s: Record<string, unknown>): { code?: string } => ({
    code: typeof s.code === 'string' ? s.code : undefined,
  }),
  component: ConnectPage,
});

function ConnectPage() {
  const t = useT();
  const { code: initial } = Route.useSearch();
  const { client, user } = useAuth();
  const [code, setCode] = useState(initial ?? '');
  const [status, setStatus] = useState<'idle' | 'ok' | 'err'>('idle');
  const [busy, setBusy] = useState(false);

  async function submit(value?: string) {
    const c = (value ?? code).trim();
    if (!c) return;
    setBusy(true);
    setStatus('idle');
    try {
      await client.quickConnectAuthorize(c);
      setStatus('ok');
    } catch {
      setStatus('err');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-16">
      <div className="w-full max-w-105 rounded-2xl border border-border bg-surface-1 p-8 text-center shadow-card">
        <h1 className="mb-2 font-display text-[26px] font-bold">{t('connect.title')}</h1>

        <NearbyTvs />

        <p className="mb-7 text-[14px] leading-relaxed text-muted">
          {user ? t('connect.codePromptForUser', { name: user.username }) : t('connect.codePrompt')}
        </p>

        {status === 'ok' ? (
          <div className="rounded-xl border border-success/40 bg-success/10 px-4 py-6">
            <div className="mb-1 text-[40px]">✓</div>
            <div className="font-display text-[18px] font-bold text-text">
              {t('connect.connected')}
            </div>
            <p className="mt-1 text-[13px] text-muted">{t('connect.willConnectSoon')}</p>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
            className="flex flex-col items-center gap-4"
          >
            <OtpField.Root
              maxLength={4}
              value={code}
              onValueChange={(v) => {
                setCode(v);
                setStatus('idle');
              }}
              onComplete={(v) => void submit(v)}
              physicalKeyboard
              autoFocus
              disabled={busy}
              label={t('connect.title')}
            />
            {status === 'err' ? (
              <p className="text-[13px] font-medium text-danger">{t('connect.invalidCode')}</p>
            ) : null}
            <Button
              block
              label={busy ? t('auth.loggingIn') : t('connect.authorize')}
              onPress={() => void submit()}
              loading={busy}
              disabled={code.trim().length < 4}
            />
          </form>
        )}
      </div>
    </main>
  );
}
