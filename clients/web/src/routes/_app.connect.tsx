import { useT } from '@kroma/ui';
import { Box, Button, Icon, OtpField, Text } from '@kroma/ui/kit';
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
    <main style={SCREEN}>
      <Box flex center px={24} py={64}>
        <Box w="100%" maxW={420} radius="xl" border="border" bg="surface1" p={32} shadow="card">
          <Text variant="subheading" accessibilityRole="header" textAlign="center" mb={8}>
            {t('connect.title')}
          </Text>

          <NearbyTvs />

          <Text variant="body" color="textMuted" textAlign="center" mb={28}>
            {user
              ? t('connect.codePromptForUser', { name: user.username })
              : t('connect.codePrompt')}
          </Text>

          {status === 'ok' ? (
            <Box radius="lg" border="success/40" bg="success/10" px={16} py={24}>
              <Box center mb={4}>
                <Icon name="check" size={38} thickness={2.4} color="success" />
              </Box>
              <Text variant="title" textAlign="center">
                {t('connect.connected')}
              </Text>
              <Text variant="meta" color="textMuted" textAlign="center" mt={4}>
                {t('connect.willConnectSoon')}
              </Text>
            </Box>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void submit();
              }}
              style={FORM}
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
                <Text variant="meta" color="danger" textAlign="center">
                  {t('connect.invalidCode')}
                </Text>
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
        </Box>
      </Box>
    </main>
  );
}

const SCREEN = { minHeight: '100vh', display: 'flex' } as const;
const FORM = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 16,
} as const;
