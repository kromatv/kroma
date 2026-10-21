import { apiErrorText } from '@kromatv/client';
import { useT } from '@kromatv/ui';
import { Box, Button, Text } from '@kromatv/ui/kit';
import { useState } from 'react';
import { useAdminHost } from './context';
import { ACTIONS } from './setting-actions';

export function ActionControl({ actionKey }: Readonly<{ actionKey: string }>) {
  const t = useT();
  const { client } = useAdminHost();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const action = ACTIONS[actionKey];
  if (!action) return null;
  return (
    <Box align="flex-end" gap={6} maxW={380}>
      <Button
        variant="glass"
        size="sm"
        icon="mail"
        label={busy ? t(action.running) : t(action.label)}
        loading={busy}
        onPress={() => {
          setBusy(true);
          setResult(null);
          action
            .run(client)
            .then((r) => setResult({ ok: true, text: action.ok(t, r) }))
            .catch((e: unknown) =>
              setResult({ ok: false, text: apiErrorText(e, t(action.failed)) }),
            )
            .finally(() => setBusy(false));
        }}
      />
      {result ? (
        <Text variant="overline" color={result.ok ? 'success' : 'danger'} textAlign="right">
          {result.text}
        </Text>
      ) : null}
    </Box>
  );
}
