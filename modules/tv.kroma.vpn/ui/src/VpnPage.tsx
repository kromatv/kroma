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
import { Badge, Button, color, Dialog, Field, PageHeader, Surface } from '@kroma/ui/kit';
import { IconShield, IconShieldCheck, IconShieldX } from '@tabler/icons-react';
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
      <div className="mt-6" />
      <VpnCard />
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className="flex h-10 w-10 flex-[0_0_40px] items-center justify-center rounded-xl border border-border-strong bg-surface-2"
            style={{ color: statusColor(configured, connected) }}
          >
            <StatusIcon configured={configured} connected={connected} />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[14.5px] font-bold">{t('vpn.title')}</span>
              {configured ? <BridgePill running={state?.bridgeRunning ?? false} /> : null}
            </div>
            <div className="mt-0.5 text-[12px] font-medium text-dim">
              {configured
                ? t('vpn.modeWireguard', { port: String(state?.localPort ?? 0) })
                : t('vpn.modeOff')}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
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
        </div>
      </div>

      {test.error || test.result ? (
        <div className="mt-3 border-t border-white/6 pt-3 text-[12.5px] font-semibold">
          <TestResultLine test={test} />
        </div>
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
  if (!configured) return <IconShield size={18} stroke={1.8} />;
  if (connected) return <IconShieldCheck size={18} stroke={1.8} />;
  return <IconShieldX size={18} stroke={1.8} />;
}

function statusColor(configured: boolean, connected: boolean): string {
  if (!configured) return color('text/50');
  return color(connected ? 'success' : 'accent');
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
  if (test.error) return <span className="text-danger-hover">{test.error}</span>;
  if (test.result?.sealed) {
    return (
      <span className="text-success">
        {t('vpn.sealed', { ip: test.result.proxiedIp ?? '?' })}
        {test.result.directIp ? ` · ${t('vpn.directIp', { ip: test.result.directIp })}` : ''}
      </span>
    );
  }
  return <span className="text-accent">{test.result?.error ?? t('vpn.notSealed')}</span>;
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
      <p className="text-[13px] leading-relaxed text-dim">{t('vpn.modalHelp')}</p>
      <Field.Root label={t('vpn.modalTitle')} hideLabel value={config} onValueChange={setConfig}>
        <Field.Textarea
          rows={9}
          placeholder={
            '[Interface]\nPrivateKey = ...\nAddress = 10.2.0.2/32\n\n[Peer]\nPublicKey = ...\nEndpoint = ...:51820\nAllowedIPs = 0.0.0.0/0'
          }
          textStyle={MONO}
        />
      </Field.Root>
      {configured ? <p className="text-[12px] text-dim">{t('vpn.configKept')}</p> : null}
      {error ? <p className="text-[13px] font-semibold text-danger-hover">{error}</p> : null}
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
