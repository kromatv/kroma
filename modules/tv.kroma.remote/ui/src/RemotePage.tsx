// Admin "Remote access" page: configure the public URL used for share / Quick
// Connect links, and (optionally) let KROMA run + supervise a Cloudflare Tunnel
// `cloudflared` connector so a box with no existing tunnel gets a public HTTPS
// endpoint without port-forwarding. Backed by this module's `/remote` admin route.
//
// One control drives the connector: the enable toggle (auto-saved). The server
// reconciles the running connector to match it, so disabling always stops it.
import { Denied, ModuleFailed, ModuleLoading, useCap, useT } from '@kroma/module-sdk';
import {
  Badge,
  Box,
  Button,
  Field,
  Icon,
  PageHeader,
  Row,
  Section,
  Surface,
  Switch,
  Text,
} from '@kroma/ui/kit';
import { type CSSProperties, useEffect, useRef, useState } from 'react';
import { useRemoteApi } from './api';
import type { RemoteAccessView } from './schemas';

// Deep link to the Zero Trust "Tunnels" page (`:account` auto-resolves to the
// signed-in account) where a tunnel's connector token is created and shown in the
// `cloudflared … run --token <TOKEN>` command.
const CF_TUNNELS_URL = 'https://one.dash.cloudflare.com/?to=/:account/networks/tunnels';

const TOKEN_LINK: CSSProperties = {
  display: 'inline-flex',
  alignSelf: 'flex-start',
  alignItems: 'center',
  gap: 6,
  marginBottom: 16,
  textDecoration: 'none',
};

const LOG_PANE: CSSProperties = {
  margin: 0,
  marginTop: 12,
  maxHeight: 288,
  overflow: 'auto',
  padding: 12,
  borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--kroma-border)',
  background: 'var(--kroma-bg)',
  font: 'var(--type-meta)',
  fontFamily: 'var(--font-mono)',
  color: 'var(--kroma-text-muted)',
};

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
        <Text variant="meta" color="textDim" mt={-8} mb={16}>
          {t('admin.remoteManagedHint')}
        </Text>
        <Surface elevated border="border" pad="none" px={22} py={20}>
          <Row between gap={16} mb={16}>
            <Row shrink={1} minW={0} gap={14}>
              <Row center w={40} h={40} shrink={0} radius="md" bg="info/16">
                <Icon name="cloud" size={20} stroke={1.8} color="info" />
              </Row>
              <Box shrink={1} minW={0}>
                <Text variant="cardTitle">{t('admin.enableRemoteAccess')}</Text>
                <Text variant="meta" color="textDim" mt={2}>
                  {t('admin.remoteAccessDesc')}
                </Text>
              </Box>
            </Row>
            <Switch checked={enabled} onChange={toggle} label={t('admin.enableRemoteAccess')} />
          </Row>

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

          <a href={CF_TUNNELS_URL} target="_blank" rel="noopener noreferrer" style={TOKEN_LINK}>
            <Icon name="external-link" size={13} stroke={2} color="accent" />
            <Text variant="meta" color="accent">
              {t('admin.remoteGetToken')}
            </Text>
          </a>

          <Row wrap gap={12} mt={4}>
            <Button
              label={busy ? t('admin.aiSaving') : t('common.save')}
              icon="device-floppy"
              variant="primary"
              size="sm"
              onPress={() => void persist(enabled)}
              disabled={busy}
            />
            {saved ? (
              <Text variant="meta" color="success">
                {t('admin.remoteSaved')}
              </Text>
            ) : null}
          </Row>
        </Surface>
      </Section.Root>

      {/* Live connector status + logs. */}
      <Section.Root title={t('admin.remoteLogs')} mt={28}>
        <Surface elevated border="border" pad="none" px={22} py={20}>
          <Row wrap gapX={24} gapY={6}>
            <StatusChip status={st} />
            {st.since ? (
              <Text variant="meta" color="textDim">
                {t('admin.remoteSince')} {new Date(st.since).toLocaleString()}
              </Text>
            ) : null}
            {st.binaryFound ? (
              <Text variant="meta" color="textDim">
                {st.binaryVersion ?? 'cloudflared'}
              </Text>
            ) : (
              <Text variant="meta" color="danger">
                {t('admin.remoteBinaryMissing')}
              </Text>
            )}
          </Row>
          {st.lastError ? (
            <Text variant="meta" color="danger" mt={8}>
              {st.lastError}
            </Text>
          ) : null}
          <pre style={LOG_PANE}>
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
