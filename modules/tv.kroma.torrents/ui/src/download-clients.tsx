// The "Clients de téléchargement" section of the downloads page: one card per
// engine (embedded / Transmission / qBittorrent) with enable toggle, live
// connection test and the add/edit modal.

import { addEngine, apiErrorText, useEnabledEngines, usePoll, useT } from '@kroma/module-sdk';
import {
  Badge,
  Box,
  Button,
  EmptyState,
  Grid,
  Icon,
  IconButton,
  Row,
  Section,
  Surface,
  Switch,
  styles,
  TableSkeleton,
  Text,
} from '@kroma/ui/kit';
import { useState } from 'react';
import { useTorrentsApi } from './api';
import { DownloadClientModal } from './download-client-modals';
import type { ClientTestResult, DownloadClientView } from './schemas';

type TestState = { busy?: boolean; result?: ClientTestResult; error?: string };

const s = styles({
  footRule: { borderTopWidth: 1, borderTopColor: 'tint/6' },
});

export function DownloadClientsSection() {
  const t = useT();
  const torrents = useTorrentsApi();
  const engines = useEnabledEngines('tv.kroma.torrents/client');
  const [tests, setTests] = useState<Record<string, TestState>>({});
  const { data, reload } = usePoll(['admin', 'downloadClients'], () => torrents.clients(), 30000);
  const clients = data?.clients ?? [];

  const openAdd = async () => {
    const changed = await addEngine({
      engines,
      title: t('dlclients.addTitle'),
      onSubmit: async (kind, v) => {
        await torrents.createClient({
          kind,
          name: v.name ?? null,
          url: v.url ?? null,
          username: v.username ?? null,
          password: v.password ?? null,
          enabled: true,
          priority: null,
        });
      },
    });
    if (changed) reload();
  };
  const openEdit = async (c: DownloadClientView) => {
    if (await DownloadClientModal.call({ client: c })) reload();
  };

  const toggle = (c: DownloadClientView, enabled: boolean) => {
    torrents
      .updateClient(c.id, {
        kind: null,
        name: null,
        url: null,
        username: null,
        password: null,
        enabled,
        priority: null,
      })
      .then(reload)
      .catch(() => reload());
  };
  const test = (c: DownloadClientView) => {
    setTests((prev) => ({ ...prev, [c.id]: { busy: true } }));
    torrents
      .testClient(c.id)
      .then((result) => setTests((prev) => ({ ...prev, [c.id]: { result } })))
      .catch((e) =>
        setTests((prev) => ({
          ...prev,
          [c.id]: { error: apiErrorText(e, t('dlclients.testFailed')) },
        })),
      );
  };

  // One button reused by the section header and the empty state (only when an
  // external download-client engine is enabled).
  const addButton =
    engines.length > 0 ? (
      <Button
        variant="glass"
        size="sm"
        icon="plus"
        label={t('dlclients.add')}
        onPress={() => void openAdd()}
      />
    ) : null;

  return (
    <Section.Root mt={28}>
      <Section.Header>
        <Section.Title>{t('dlclients.sectionTitle')}</Section.Title>
        {addButton ? <Section.Actions>{addButton}</Section.Actions> : null}
      </Section.Header>
      {data === null ? <TableSkeleton rows={3} /> : null}
      <Grid min={360} gap={16}>
        {clients.map((c) => (
          <Surface key={c.id} elevated border="border" pad="none" p={18}>
            <Row align="flex-start" between gap={16}>
              <Row flex minW={0} gap={12}>
                <Box
                  w={40}
                  h={40}
                  shrink={0}
                  center
                  radius="xl"
                  border="borderStrong"
                  bg="surface2"
                >
                  <Icon
                    name={c.builtin ? 'cpu' : 'server'}
                    size={18}
                    thickness={1.8}
                    color="accent"
                  />
                </Box>
                <Box flex minW={0}>
                  <Row gap={8}>
                    <Text variant="label" shrink={1} minW={0} lines={1}>
                      {c.name}
                    </Text>
                    <Badge tone="info">{c.builtin ? t('dlclients.embedded') : c.kind}</Badge>
                  </Row>
                  {/* A sentence wraps; an address does not, because a URL has
                      no spaces to wrap at and would push the row open again. */}
                  <Text variant="meta" color="textDim" lines={c.builtin ? undefined : 1} mt={2}>
                    {c.builtin ? t('dlclients.embeddedSub') : c.url}
                  </Text>
                </Box>
              </Row>
              <Switch checked={c.enabled} onCheckedChange={(v) => toggle(c, v)} label={c.name} />
            </Row>
            <Row between gap={12} mt={14} pt={12} style={s.footRule}>
              <TestLine test={tests[c.id]} />
              <Row gap={8}>
                <Button
                  variant="glass"
                  size="sm"
                  label={t('dlclients.test')}
                  onPress={() => test(c)}
                  loading={tests[c.id]?.busy}
                />
                {!c.builtin ? (
                  <IconButton
                    icon="pencil"
                    label={t('dlclients.edit')}
                    onPress={() => void openEdit(c)}
                  />
                ) : null}
              </Row>
            </Row>
          </Surface>
        ))}
      </Grid>
      {data && clients.length === 0 ? (
        <EmptyState.Root icon="server">
          <EmptyState.Title>{t('dlclients.empty')}</EmptyState.Title>
          {addButton ? <EmptyState.Actions>{addButton}</EmptyState.Actions> : null}
        </EmptyState.Root>
      ) : null}

      <DownloadClientModal />
    </Section.Root>
  );
}

function TestLine({ test }: Readonly<{ test?: TestState }>) {
  const t = useT();
  if (test?.busy) {
    return (
      <Text variant="meta" color="text/45">
        {t('dlclients.testing')}
      </Text>
    );
  }
  if (test?.error || test?.result?.error) {
    return (
      <Text variant="meta" color="dangerHover" shrink={1} minW={0}>
        {test.error ?? test.result?.error}
      </Text>
    );
  }
  if (test?.result?.ok) {
    return (
      <Text variant="meta" color="success">
        {test.result.version}
      </Text>
    );
  }
  return (
    <Text variant="meta" color="text/30">
      {t('dlclients.notTested')}
    </Text>
  );
}
