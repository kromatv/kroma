import { apiErrorText, useAsyncAction, useT } from '@kromatv/module-sdk';
import { Box, Button, Dialog, Field, Row, SegmentGroup, Text } from '@kromatv/ui/kit';
import { useState } from 'react';
import { useVpnApi } from './api';
import { MullvadPanel } from './mullvad-panel';
import { ProtonPanel } from './proton-panel';
import type { VpnProvider } from './schemas';
import { readWireGuard } from './wireguard-file';

const MONO = { fontFamily: 'monospace', fontSize: 13 } as const;

type Choice = 'mullvad' | 'proton' | 'other';

function firstChoice(provider: VpnProvider | null, configured: boolean): Choice {
  if (provider) return provider.kind;
  return configured ? 'other' : 'mullvad';
}

/** Connect the tunnel: Mullvad by itself, Proton by the file its generator
 * hands out, any other provider by pasting its WireGuard config. */
export function VpnConfigDialog({
  provider,
  configured,
  onClose,
  onSaved,
}: Readonly<{
  provider: VpnProvider | null;
  configured: boolean;
  onClose: () => void;
  onSaved: () => void;
}>) {
  const t = useT();
  const vpn = useVpnApi();
  const { busy, error, run } = useAsyncAction();
  const [choice, setChoice] = useState<Choice>(firstChoice(provider, configured));
  const done = () => {
    onSaved();
    onClose();
  };

  const save = (wgConfig: string) =>
    run(
      async () => {
        await vpn.save({ wgConfig, localPort: null });
        done();
      },
      (e) => apiErrorText(e, t('requests.actionFailed')),
    );

  const keep = (configs: string[]) =>
    run(
      async () => {
        await vpn.saveConfigs(configs, true);
        done();
      },
      (e) => apiErrorText(e, t('requests.actionFailed')),
    );

  const remove = () =>
    run(
      async () => {
        if (provider?.kind === 'mullvad') await vpn.mullvadDisconnect();
        else await vpn.save({ wgConfig: '', localPort: null });
        done();
      },
      (e) => apiErrorText(e, t('requests.actionFailed')),
    );

  return (
    <Dialog.Root open title={t('vpn.modalTitle')} onClose={onClose} width="md">
      <SegmentGroup.Root<Choice>
        value={choice}
        onValueChange={setChoice}
        label={t('vpn.providerChoice')}
        size="sm"
        stretch
      >
        <SegmentGroup.Item value="mullvad">
          <SegmentGroup.Label>{t('vpn.providerMullvad')}</SegmentGroup.Label>
        </SegmentGroup.Item>
        <SegmentGroup.Item value="proton">
          <SegmentGroup.Label>{t('vpn.providerProton')}</SegmentGroup.Label>
        </SegmentGroup.Item>
        <SegmentGroup.Item value="other">
          <SegmentGroup.Label>{t('vpn.providerOther')}</SegmentGroup.Label>
        </SegmentGroup.Item>
      </SegmentGroup.Root>
      {choice === 'mullvad' ? (
        <MullvadPanel held={provider?.kind === 'mullvad' ? provider : null} onConnected={done} />
      ) : null}
      {choice === 'proton' ? <ProtonPanel busy={busy} onSave={keep} /> : null}
      {choice === 'other' ? <PastePanel busy={busy} onSave={save} /> : null}
      {error ? (
        <Text variant="meta" color="dangerHover">
          {error}
        </Text>
      ) : null}
      {configured ? (
        <Row between align="center" gap={12}>
          <Text variant="meta" color="textDim" shrink={1}>
            {t('vpn.configKept')}
          </Text>
          <Button
            variant="dangerGhost"
            size="sm"
            label={t('vpn.removeConfig')}
            onPress={remove}
            disabled={busy}
          />
        </Row>
      ) : null}
    </Dialog.Root>
  );
}

function PastePanel({
  busy,
  onSave,
}: Readonly<{ busy: boolean; onSave: (config: string) => void }>) {
  const t = useT();
  const [config, setConfig] = useState('');
  const valid = readWireGuard(config).valid;
  return (
    <Box gap={12}>
      <Text variant="meta" color="textDim">
        {t('vpn.modalHelp')}
      </Text>
      <Field.Root
        label={t('vpn.modalTitle')}
        hideLabel
        value={config}
        onValueChange={setConfig}
        error={config.trim() && !valid ? t('vpn.invalidConfig') : undefined}
      >
        <Field.Textarea
          rows={9}
          placeholder={
            '[Interface]\nPrivateKey = ...\nAddress = 10.2.0.2/32\n\n[Peer]\nPublicKey = ...\nEndpoint = ...:51820\nAllowedIPs = 0.0.0.0/0'
          }
          textStyle={MONO}
        />
      </Field.Root>
      <Row>
        <Button
          variant="primary"
          label={t('vpn.connect')}
          onPress={() => onSave(config.trim())}
          loading={busy}
          disabled={!valid || busy}
        />
      </Row>
    </Box>
  );
}
