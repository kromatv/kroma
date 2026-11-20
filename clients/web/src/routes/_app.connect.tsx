import { useT } from '@kromatv/ui';
import {
  Box,
  Button,
  classes,
  Icon,
  OtpField,
  SegmentGroup,
  styles,
  Text,
  useStyles,
} from '@kromatv/ui/kit';
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { NearbyTvs } from '#web/features/accounts/nearby-tvs.component';
import { useAuth } from '#web/shared/lib/auth';
import { page } from '#web/shared/ui';

// The approver side of pairing, as the phone draws it: two roads to the same
// place, one on screen at a time. The televisions waiting on this network lead,
// because they ask nothing of the reader; the code a TV shows is the road that
// works from anywhere. AuthGate guarantees the sign-in.
export const Route = createFileRoute('/_app/connect')({
  validateSearch: (s: Record<string, unknown>): { code?: string } => ({
    code: typeof s.code === 'string' ? s.code : undefined,
  }),
  component: ConnectPage,
});

const MODES = ['network', 'code'] as const;
type ConnectMode = (typeof MODES)[number];

function ConnectPage() {
  const pageScoped = useStyles(page);
  const t = useT();
  const { code } = Route.useSearch();
  const { user } = useAuth();
  const [mode, setMode] = useState<ConnectMode>(code ? 'code' : 'network');
  const codePrompt = user
    ? t('connect.codePromptForUser', { name: user.username })
    : t('connect.codePrompt');

  return (
    <main className={classes(pageScoped.screen)}>
      <Box flex center px={24} py={64}>
        <Box w="100%" maxW={440} radius="xl" border="border" bg="surface1" p={32} gap={20}>
          <Text variant="subheading" accessibilityRole="header" textAlign="center">
            {t('connect.title')}
          </Text>

          <Modes mode={mode} onChange={setMode} />

          <Text variant="meta" color="textMuted" textAlign="center">
            {mode === 'network' ? t('handoff.nearbySub') : codePrompt}
          </Text>

          {mode === 'network' ? <NearbyTvs /> : <CodeEntry initial={code ?? ''} />}
        </Box>
      </Box>
    </main>
  );
}

interface ModesProps {
  mode: ConnectMode;
  onChange: (mode: ConnectMode) => void;
}

function Modes({ mode, onChange }: Readonly<ModesProps>) {
  const t = useT();
  return (
    <SegmentGroup.Root value={mode} onValueChange={onChange} label={t('connect.title')} stretch>
      {MODES.map((m) => (
        <SegmentGroup.Item key={m} value={m}>
          <SegmentGroup.Label>{t(`connect.mode.${m}`)}</SegmentGroup.Label>
        </SegmentGroup.Item>
      ))}
    </SegmentGroup.Root>
  );
}

function CodeEntry({ initial }: Readonly<{ initial: string }>) {
  const s = useStyles(sDefinition);
  const t = useT();
  const { client } = useAuth();
  const [code, setCode] = useState(initial);
  const [status, setStatus] = useState<'idle' | 'ok' | 'err'>('idle');
  const [busy, setBusy] = useState(false);

  async function submit(value?: string) {
    const typed = (value ?? code).trim();
    if (!typed) {
      return;
    }
    setBusy(true);
    setStatus('idle');
    try {
      await client.accounts.quickConnect.authorize(typed);
      setStatus('ok');
    } catch {
      setStatus('err');
    } finally {
      setBusy(false);
    }
  }

  if (status === 'ok') {
    return <Connected />;
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      className={classes(s.form)}
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
        invalid={status === 'err'}
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
  );
}

function Connected() {
  const t = useT();
  return (
    <Box radius="xl" border="success/40" bg="success/10" px={16} py={24}>
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
  );
}

const sDefinition = styles({
  form: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 },
});
