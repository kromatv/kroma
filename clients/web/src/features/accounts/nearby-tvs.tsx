// The fast half of "connect a device": the TVs waiting on this network, one tap
// each. Everything it decides lives in `useNearbyTvs`; this brings the rows.

import type { DiscoveredTv, GrantResult } from '@kroma/core';
import { HANDOFF_CHECK_LENGTH } from '@kroma/core';
import { useCheckPrompt, useHandoffPicker, useNearbyTvs } from '@kroma/core/react';
import { useT } from '@kroma/ui';
import {
  Box,
  Button,
  NearbyTvList,
  OtpField,
  REGEXP_ONLY_DIGITS_AND_CHARS,
  Text,
} from '@kroma/ui/kit';
import { useAuth } from '#web/shared/lib/auth';

export function NearbyTvs() {
  const t = useT();
  const { client } = useAuth();
  const { devices, connecting, connect } = useNearbyTvs({ client });
  const { rows, asking, outcomeFor, start, grant, stopAsking } = useHandoffPicker({
    devices,
    connect,
  });

  if (rows.length === 0 && !asking) return null;

  return (
    <Box role="region" mb={32}>
      <Text variant="label" font="display" textAlign="left" mb={4}>
        {t('handoff.nearbyTitle')}
      </Text>
      <Text variant="meta" color="textMuted" textAlign="left" mb={16}>
        {t('handoff.nearbySub')}
      </Text>

      {asking ? (
        <CheckPrompt device={asking} onGrant={grant} onCancel={stopAsking} />
      ) : (
        <NearbyTvList
          devices={rows}
          connectingHandle={connecting?.handle}
          outcomeFor={outcomeFor}
          onSelect={start}
          t={t}
        />
      )}

      <Text variant="meta" color="textDim" textAlign="center" mt={18}>
        {t('handoff.otherWays')}
      </Text>
    </Box>
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
    <Box align="center" gap={16} radius="lg" border="border" bg="surface2" px={16} py={24}>
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
