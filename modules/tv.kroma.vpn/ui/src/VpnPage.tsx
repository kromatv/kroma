// The VPN module page (`/admin/m/vpn`): the managed WireGuard bridge state, a
// paste-your-config modal and a live seal test, plus the network-wide toggles
// (kill switch, route indexers through the tunnel) from the settings view. VPN
// routing is WireGuard-only (any provider). Default export so the module runtime
// can React.lazy it into its own chunk.

import {
  apiErrorText,
  Denied,
  ModuleFailed,
  ModuleLoading,
  SettingsView,
  useAsyncAction,
  useCap,
  usePoll,
  useT,
} from '@kroma/module-sdk';
import {
  Badge,
  Box,
  Button,
  type ColorValue,
  Dialog,
  Divider,
  Field,
  Icon,
  PageHeader,
  Row,
  Surface,
  Text,
} from '@kroma/ui/kit';
import { useState } from 'react';
import { useVpnApi } from './api';
import type { VpnTestResult } from './schemas';

const MONO = { fontFamily: 'monospace', fontSize: 13 } as const;

// The VPN is global to several flows (torrent downloads and, optionally, indexer
// searches), so it lives on its own page: the WireGuard config card + the
// network-wide toggles (kill switch, route indexers through the tunnel).
export default function VpnPage() {
  const t = useT();
  if (!useCap('settings.manage')) return <Denied />;
  return (
    <>
      <PageHeader.Root title={t('admin.vpnTitle')} subtitle={t('admin.vpnSub')} />
      <Box mt={24}>
        <VpnCard />
      </Box>
      <SettingsView view="vpn" titleKey="admin.vpnTitle" subtitleKey="admin.vpnSub" embedded />
    </>
  );
}

export function VpnCard() {
  const t = useT();
  const vpn = useVpnApi();
  const [modal, setModal] = useState(false);
  const [test, setTest] = useState<{ busy?: boolean; result?: VpnTestResult; error?: string }>({});
  const { data, failed, reload } = usePoll(['admin', 'vpn'], () => vpn.status(), 30000);

  const runTest = () => {
    setTest({ busy: true });
    vpn
      .test()
      .then((result) => setTest({ result }))
      .catch((e) => setTest({ error: apiErrorText(e, t('vpn.testFailed')) }));
  };

  // Before the first answer, `wgConfigured: false` would paint the whole
  // not-configured card - a claim about the server we cannot make yet.
  if (!data) return failed ? <ModuleFailed retry={reload} /> : <ModuleLoading panels={1} />;
  const state = data;
  const configured = state.wgConfigured;
  const connected = state.status?.connected ?? false;

  return (
    <Surface elevated border="border" pad="none" p={18} mb={20}>
      <Row wrap between gap={12}>
        <Row shrink={1} minW={0} gap={12}>
          <Row center w={40} h={40} shrink={0} radius="lg" border="borderStrong" bg="surface2">
            <StatusIcon configured={configured} connected={connected} />
          </Row>
          <Box shrink={1} minW={0}>
            <Row gap={8}>
              <Text variant="cardTitle" lines={1} shrink={1} minW={0}>
                {t('vpn.title')}
              </Text>
              {configured ? <BridgePill running={state?.bridgeRunning ?? false} /> : null}
            </Row>
            <Text variant="meta" color="textDim" mt={2}>
              {configured
                ? t('vpn.modeWireguard', { port: String(state?.localPort ?? 0) })
                : t('vpn.modeOff')}
            </Text>
          </Box>
        </Row>
        <Row gap={8}>
          {configured ? (
            <Button
              variant="glass"
              size="sm"
              label={t('vpn.test')}
              onPress={runTest}
              loading={test.busy}
            />
          ) : null}
          <Button
            variant="primary"
            size="sm"
            label={t(state?.wgConfigured ? 'vpn.reconfigure' : 'vpn.configure')}
            onPress={() => setModal(true)}
          />
        </Row>
      </Row>

      {test.error || test.result ? (
        <Box mt={12}>
          <Divider color="tint/6" />
          <Box pt={12}>
            <TestResultLine test={test} />
          </Box>
        </Box>
      ) : null}

      {modal ? (
        <VpnConfigModal
          configured={configured}
          onClose={() => setModal(false)}
          onSaved={() => {
            reload();
            setTest({});
          }}
        />
      ) : null}
    </Surface>
  );
}

function StatusIcon({
  configured,
  connected,
}: Readonly<{ configured: boolean; connected: boolean }>) {
  const paint = statusColor(configured, connected);
  if (!configured) return <Icon name="shield" size={18} stroke={1.8} color={paint} />;
  if (connected) return <Icon name="shield-check" size={18} stroke={1.8} color={paint} />;
  return <Icon name="shield-x" size={18} stroke={1.8} color={paint} />;
}

function statusColor(configured: boolean, connected: boolean): ColorValue {
  if (!configured) return 'text/50';
  return connected ? 'success' : 'accent';
}

function BridgePill({ running }: Readonly<{ running: boolean }>) {
  const t = useT();
  return (
    <Badge tone={running ? 'success' : 'danger'}>
      {running ? t('vpn.bridgeUp') : t('vpn.bridgeDown')}
    </Badge>
  );
}

function TestResultLine({
  test,
}: Readonly<{ test: { busy?: boolean; result?: VpnTestResult; error?: string } }>) {
  const t = useT();
  if (test.error) {
    return (
      <Text variant="meta" color="dangerHover">
        {test.error}
      </Text>
    );
  }
  if (test.result?.sealed) {
    return (
      <Text variant="meta" color="success">
        {t('vpn.sealed', { ip: test.result.proxiedIp ?? '?' })}
        {test.result.directIp ? ` · ${t('vpn.directIp', { ip: test.result.directIp })}` : ''}
      </Text>
    );
  }
  return (
    <Text variant="meta" color="accent">
      {test.result?.error ?? t('vpn.notSealed')}
    </Text>
  );
}

function VpnConfigModal({
  configured,
  onClose,
  onSaved,
}: Readonly<{ configured: boolean; onClose: () => void; onSaved: () => void }>) {
  const t = useT();
  const vpn = useVpnApi();
  const { busy, error, run } = useAsyncAction();
  const [config, setConfig] = useState('');

  const save = (wgConfig: string) =>
    run(
      async () => {
        await vpn.save({ wgConfig, localPort: null });
        onSaved();
        onClose();
      },
      (e) => apiErrorText(e, t('requests.actionFailed')),
    );

  return (
    <Dialog open title={t('vpn.modalTitle')} onClose={onClose} width={520}>
      <Text variant="meta" color="textDim">
        {t('vpn.modalHelp')}
      </Text>
      <Field.Root label={t('vpn.modalTitle')} hideLabel value={config} onValueChange={setConfig}>
        <Field.Textarea
          rows={9}
          placeholder={
            '[Interface]\nPrivateKey = ...\nAddress = 10.2.0.2/32\n\n[Peer]\nPublicKey = ...\nEndpoint = ...:51820\nAllowedIPs = 0.0.0.0/0'
          }
          textStyle={MONO}
        />
      </Field.Root>
      {configured ? (
        <Text variant="meta" color="textDim">
          {t('vpn.configKept')}
        </Text>
      ) : null}
      {error ? (
        <Text variant="meta" color="dangerHover">
          {error}
        </Text>
      ) : null}
      <Dialog.Actions
        onCancel={onClose}
        cancelLabel={t('common.cancel')}
        onConfirm={() => save(config.trim())}
        confirmLabel={busy ? t('common.saving') : t('common.save')}
        busy={busy}
        disabled={!config.trim()}
      >
        {configured ? (
          <Button
            variant="dangerGhost"
            size="sm"
            label={t('vpn.removeConfig')}
            onPress={() => save('')}
            disabled={busy}
          />
        ) : null}
      </Dialog.Actions>
    </Dialog>
  );
}
