// The fast half of "connect a device": the TVs waiting on this network, one tap
// each. Everything it decides lives in `useNearbyTvs`; this brings the rows, and
// says that it is looking, then that nothing answered, as the phone's does.

import type { DiscoveredTv, GrantResult } from '@kromatv/core';
import { HANDOFF_CHECK_LENGTH } from '@kromatv/core';
import { useCheckPrompt, useHandoffPicker, useNearbyTvs } from '@kromatv/core/react';
import { useT } from '@kromatv/ui';
import {
  Box,
  Button,
  EmptyState,
  NearbyTvList,
  OtpField,
  REGEXP_ONLY_DIGITS_AND_CHARS,
  Spinner,
  Text,
} from '@kromatv/ui/kit';
import { useEffect, useState } from 'react';
import { useAuth } from '#web/shared/lib/auth';

// A television answers the server in about a second, but "nothing here" the
// instant the mode opens is a lie the reader acts on.
const SETTLE_MS = 4000;

export function NearbyTvs() {
  const t = useT();
  const { client } = useAuth();
  const { devices, connecting, connect } = useNearbyTvs({ client });
  const { rows, asking, outcomeFor, start, grant, stopAsking } = useHandoffPicker({
    devices,
    connect,
  });
  const settled = useSettled(SETTLE_MS);

  if (asking) {
    return <CheckPrompt device={asking} onGrant={grant} onCancel={stopAsking} />;
  }
  if (rows.length === 0) {
    return <NothingYet settled={settled} />;
  }
  return (
    <NearbyTvList
      devices={rows}
      connectingHandle={connecting?.handle}
      outcomeFor={outcomeFor}
      onSelect={start}
      t={t}
    />
  );
}

function useSettled(afterMs: number): boolean {
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => {
      setSettled(true);
    }, afterMs);
    return () => clearTimeout(timer);
  }, [afterMs]);
  return settled;
}

function NothingYet({ settled }: Readonly<{ settled: boolean }>) {
  const t = useT();
  if (!settled) {
    return (
      <EmptyState.Root size="sm" icon="device-tv">
        <EmptyState.Title>{t('handoff.nearbySearching')}</EmptyState.Title>
        <EmptyState.Actions>
          <Spinner size={18} thickness={2} />
        </EmptyState.Actions>
      </EmptyState.Root>
    );
  }
  return (
    <EmptyState.Root size="sm" icon="device-tv">
      <EmptyState.Title>{t('handoff.nearbyEmpty')}</EmptyState.Title>
      <EmptyState.Hint>{t('handoff.nearbyEmptyHint')}</EmptyState.Hint>
    </EmptyState.Root>
  );
}

function CheckPrompt({
  device,
  onGrant,
  onCancel,
}: Readonly<{
  device: DiscoveredTv;
  onGrant: (device: DiscoveredTv, check: string) => Promise<GrantResult>;
  onCancel: () => void;
}>) {
  const t = useT();
  const { code, setCode, busy, refused, submit } = useCheckPrompt({ device, onGrant });
  const asked = t('handoff.checkPrompt', { name: device.name });

  return (
    <Box align="center" gap={16} radius="xl" border="border" bg="surface2" px={16} py={24}>
      <Text variant="label" font="display" textAlign="center">
        {asked}
      </Text>
      <OtpField.Root
        maxLength={HANDOFF_CHECK_LENGTH}
        value={code}
        onValueChange={setCode}
        onComplete={(value) => void submit(value)}
        pattern={REGEXP_ONLY_DIGITS_AND_CHARS}
        physicalKeyboard
        autoFocus
        disabled={busy}
        invalid={refused !== null}
        label={asked}
      />
      <Text variant="meta" color={refused ? 'danger' : 'textMuted'} textAlign="center">
        {refused ? t(`handoff.${refused}`) : t('handoff.checkHint')}
      </Text>
      <Button variant="ghost" size="sm" label={t('common.cancel')} onPress={onCancel} />
    </Box>
  );
}
