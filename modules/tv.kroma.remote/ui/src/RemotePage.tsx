// Admin "Remote access" page: configure the public URL used for share / Quick
// Connect links, and (optionally) let KROMA run + supervise a Cloudflare Tunnel
// `cloudflared` connector so a box with no existing tunnel gets a public HTTPS
// endpoint without port-forwarding. Backed by this module's `/remote` admin route.
//
// One control drives the connector: the enable toggle (auto-saved). The server
// reconciles the running connector to match it, so disabling always stops it.
import { Denied, ModuleFailed, ModuleLoading, useCap, useT } from '@kroma/module-sdk';
import { Badge, Button, Field, PageHeader, Section, Surface, Switch } from '@kroma/ui/kit';
import { IconCloud, IconExternalLink } from '@tabler/icons-react';
import { useEffect, useRef, useState } from 'react';
import { useRemoteApi } from './api';
import type { RemoteAccessView } from './schemas';

// Deep link to the Zero Trust "Tunnels" page (`:account` auto-resolves to the
// signed-in account) where a tunnel's connector token is created and shown in the
// `cloudflared … run --token <TOKEN>` command.
const CF_TUNNELS_URL = 'https://one.dash.cloudflare.com/?to=/:account/networks/tunnels';

export default function RemotePage() {
  const t = useT();
  const remote = useRemoteApi();
  const canManage = useCap('settings.manage');

  // Server view is the source of truth for live status + `hasToken`; the form
  // fields are editable copies so polling never clobbers in-progress edits.
  const [view, setView] = useState<RemoteAccessView | null>(null);
  const [url, setUrl] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  // A first fetch that never answers must not leave a blank page: the page
  // waits, then says the data failed. Later polls keep the last good view.
  const [failed, setFailed] = useState(false);
  const loaded = useRef(false);

  useEffect(() => {
    remote
      .status()
      .then((v) => {
        setView(v);
        setFailed(false);
        if (!loaded.current) {
          loaded.current = true;
          setUrl(v.url);
          setEnabled(v.enabled);
        }
      })
      .catch(() => setFailed(true));
  }, [remote]);

  // Poll live status (running / logs) without touching the form fields.
  useEffect(() => {
    const id = setInterval(() => {
      remote
        .status()
        .then(setView)
        .catch(() => undefined);
    }, 4000);
    return () => clearInterval(id);
  }, [remote]);

  if (!canManage) return <Denied />;
  if (!view) return failed ? <ModuleFailed /> : <ModuleLoading panels={2} />;
  const st = view.status;

  // Persist config; the server reconciles the connector to match `enabled`.
  const persist = async (en: boolean) => {
    setBusy(true);
    setSaved(false);
    try {
      const v = await remote.save({ enabled: en, url, ...(token ? { token } : {}) });
      setView(v);
      if (token) setToken('');
      setSaved(true);
    } finally {
      setBusy(false);
    }
  };
  // The toggle is the single connector control it auto-saves so enabling /
  // disabling takes effect immediately (and survives a restart).
  const toggle = (v: boolean) => {
    setEnabled(v);
    void persist(v);
  };

  return (
    <>
      <PageHeader.Root
        title={t('admin.remoteAccess')}
        subtitle={t('admin.remoteAccessDesc')}
        actions={<StatusChip status={st} />}
      />

      {/* Public URL (used for share / Quick Connect links; always applicable). */}
      <Surface elevated border="border" pad="none" px={22} py={20} mt={24}>
        <Field.Root
          label={t('admin.customUrl')}
          hint={t('admin.customUrlHint')}
          value={url}
          onValueChange={setUrl}
        >
          <Field.Input placeholder="https://kroma.example.com" />
        </Field.Root>
      </Surface>

      {/* Managed connector (optional). */}
      <Section.Root title={t('admin.remoteManaged')} mt={28}>
        <p className="-mt-2 mb-4 text-[12.5px] text-dim">{t('admin.remoteManagedHint')}</p>
        <Surface elevated border="border" pad="none" px={22} py={20}>
          <div className="mb-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px] bg-info/16 text-info">
                <IconCloud size={20} stroke={1.8} />
              </span>
              <div>
                <div className="text-[15px] font-bold">{t('admin.enableRemoteAccess')}</div>
                <div className="mt-0.5 text-[12.5px] text-dim">{t('admin.remoteAccessDesc')}</div>
              </div>
            </div>
            <Switch checked={enabled} onChange={toggle} label={t('admin.enableRemoteAccess')} />
          </div>

          <Field.Root
            label={t('admin.remoteToken')}
            hint={t('admin.remoteTokenHint')}
            value={token}
            onValueChange={setToken}
            mb={12}
          >
            <Field.Input
              type="password"
              placeholder={view.hasToken ? t('admin.remoteTokenKeep') : 'eyJhIjoi…'}
            />
          </Field.Root>

          <a
            href={CF_TUNNELS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mb-4 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-accent hover:underline"
          >
            <IconExternalLink size={13} stroke={2} />
            {t('admin.remoteGetToken')}
          </a>

          <div className="mt-1 flex flex-wrap items-center gap-3">
            <Button
              label={busy ? t('admin.aiSaving') : t('common.save')}
              icon="device-floppy"
              variant="primary"
              size="sm"
              onPress={() => void persist(enabled)}
              disabled={busy}
            />
            {saved ? (
              <span className="text-[13px] font-semibold text-success">
                {t('admin.remoteSaved')}
              </span>
            ) : null}
          </div>
        </Surface>
      </Section.Root>

      {/* Live connector status + logs. */}
      <Section.Root title={t('admin.remoteLogs')} mt={28}>
        <Surface elevated border="border" pad="none" px={22} py={20}>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1.5 text-[13px]">
            <StatusChip status={st} />
            {st.since ? (
              <span className="text-dim">
                {t('admin.remoteSince')} {new Date(st.since).toLocaleString()}
              </span>
            ) : null}
            {st.binaryFound ? (
              <span className="text-dim">{st.binaryVersion ?? 'cloudflared'}</span>
            ) : (
              <span className="text-danger">{t('admin.remoteBinaryMissing')}</span>
            )}
          </div>
          {st.lastError ? (
            <div className="mt-2 text-[12.5px] text-danger">{st.lastError}</div>
          ) : null}
          <pre className="mt-3 max-h-72 overflow-auto rounded-[9px] border border-border bg-bg p-3 text-[11.5px] leading-relaxed text-muted">
            {st.logs.length ? st.logs.join('\n') : t('admin.remoteNoLogs')}
          </pre>
        </Surface>
      </Section.Root>
    </>
  );
}

function StatusChip({ status }: Readonly<{ status: RemoteAccessView['status'] }>) {
  const t = useT();
  if (status.running) {
    return <Badge tone="success">{t('admin.remoteConnected')}</Badge>;
  }
  if (status.connecting) {
    return <Badge tone="warning">{t('admin.remoteConnecting')}</Badge>;
  }
  return <Badge tone="neutral">{t('admin.remoteDisconnected')}</Badge>;
}
