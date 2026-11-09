import { useT } from '@kromatv/module-sdk';
import { Badge, Box, Button, Callout, Dropzone, Row, Text } from '@kromatv/ui/kit';
import { useState } from 'react';
import { readWireGuard, type WireGuardFile } from './wireguard-file';

const PROTON_DOWNLOADS = 'https://account.protonvpn.com/downloads';
const MAX_CONFIG_BYTES = 16 * 1024;
const STEPS = ['vpn.protonStep1', 'vpn.protonStep2', 'vpn.protonStep3'] as const;
const LINK = { color: 'inherit', textDecoration: 'underline' } as const;

interface Dropped {
  name: string;
  text: string;
  file: WireGuardFile;
}

/** Proton offers no way for another app to make a config, so the page walks
 * the admin through Proton's own generator and takes the files it hands out:
 * one per country, kept so the card switches between them in one click. */
export function ProtonPanel({
  busy,
  onSave,
}: Readonly<{ busy: boolean; onSave: (configs: string[]) => void }>) {
  const t = useT();
  const [dropped, setDropped] = useState<Dropped[]>([]);
  const [refused, setRefused] = useState(false);
  const valid = dropped.length > 0 && dropped.every((one) => one.file.valid);

  const take = async (picked: File[]) => {
    const read = await Promise.all(
      picked.map(async (one) => {
        const text = await one.text();
        return { name: one.name, text, file: readWireGuard(text) };
      }),
    );
    setRefused(read.some((one) => !one.file.valid));
    setDropped(read);
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
        multiple
        onDrop={(picked) => void take(picked)}
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
      {valid ? (
        <Callout.Root tone="success">
          <Callout.Title>{t('vpn.protonFiles', { count: dropped.length })}</Callout.Title>
          {dropped.map((one) => (
            <Callout.Detail key={one.name}>
              {one.file.proton?.server
                ? t('vpn.protonDetected', { server: one.file.proton.server })
                : one.name}
              {one.file.proton?.portForwarding ? ` · ${t('vpn.protonPortForwarding')}` : ''}
            </Callout.Detail>
          ))}
        </Callout.Root>
      ) : null}
      <Row>
        <Button
          variant="primary"
          label={t('vpn.connect')}
          onPress={() => onSave(dropped.map((one) => one.text.trim()))}
          loading={busy}
          disabled={!valid || busy}
        />
      </Row>
    </Box>
  );
}
