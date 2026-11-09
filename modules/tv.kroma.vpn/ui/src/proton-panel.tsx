import { useT } from '@kromatv/module-sdk';
import { Badge, Box, Button, Callout, Dropzone, Row, Text } from '@kromatv/ui/kit';
import { useState } from 'react';
import { readWireGuard } from './wireguard-file';

const PROTON_DOWNLOADS = 'https://account.protonvpn.com/downloads';
const MAX_CONFIG_BYTES = 16 * 1024;
const STEPS = ['vpn.protonStep1', 'vpn.protonStep2', 'vpn.protonStep3'] as const;
const LINK = { color: 'inherit', textDecoration: 'underline' } as const;

/** Proton offers no way for another app to make a config, so the page walks
 * the admin through Proton's own generator and takes the file it hands out. */
export function ProtonPanel({
  busy,
  onSave,
}: Readonly<{ busy: boolean; onSave: (config: string) => void }>) {
  const t = useT();
  const [config, setConfig] = useState<string | null>(null);
  const [refused, setRefused] = useState(false);
  const file = config === null ? null : readWireGuard(config);

  const take = async (picked: File | undefined) => {
    if (!picked) return;
    const text = await picked.text();
    setRefused(!readWireGuard(text).valid);
    setConfig(text);
  };

  return (
    <Box gap={16}>
      <Text variant="meta" color="textDim">
        {t('vpn.protonIntro')}
      </Text>
      <Box gap={8}>
        {STEPS.map((step, index) => (
          <Row key={step} gap={10} align="flex-start">
            <Badge tone="neutral">{String(index + 1)}</Badge>
            <Text variant="meta" shrink={1}>
              {t(step)}
            </Text>
          </Row>
        ))}
      </Box>
      <Row>
        <a href={PROTON_DOWNLOADS} target="_blank" rel="noopener noreferrer" style={LINK}>
          <Text variant="label">{t('vpn.protonOpen')}</Text>
        </a>
      </Row>
      <Dropzone.Root
        label={t('vpn.protonDrop')}
        accept=".conf,text/plain"
        maxSize={MAX_CONFIG_BYTES}
        onDrop={([picked]) => void take(picked)}
        onReject={() => setRefused(true)}
      >
        <Dropzone.Icon />
        <Dropzone.Title>{t('vpn.protonDrop')}</Dropzone.Title>
        <Dropzone.Description>{t('vpn.protonDropHint')}</Dropzone.Description>
      </Dropzone.Root>
      {refused ? (
        <Callout.Root tone="danger">
          <Callout.Title>{t('vpn.invalidConfig')}</Callout.Title>
        </Callout.Root>
      ) : null}
      {file?.valid ? (
        <Callout.Root tone="success">
          <Callout.Title>
            {file.proton?.server
              ? t('vpn.protonDetected', { server: file.proton.server })
              : t('vpn.configReady')}
          </Callout.Title>
          {file.proton?.portForwarding ? (
            <Callout.Detail>{t('vpn.protonPortForwarding')}</Callout.Detail>
          ) : null}
        </Callout.Root>
      ) : null}
      <Row>
        <Button
          variant="primary"
          label={t('vpn.connect')}
          onPress={() => config && onSave(config.trim())}
          loading={busy}
          disabled={!file?.valid || busy}
        />
      </Row>
    </Box>
  );
}
