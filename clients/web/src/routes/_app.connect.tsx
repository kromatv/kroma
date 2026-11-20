import { useT } from '@kromatv/ui';
import { Box, classes, SegmentGroup, Text, useStyles } from '@kromatv/ui/kit';
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { CodeEntry } from '#web/features/accounts/code-entry.component';
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
