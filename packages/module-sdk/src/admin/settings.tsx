// Generic settings renderer: fetches a settings view (general / network / vpn /
// acquisition / ...) and renders its groups of toggle/select/text/value rows.
// Changes persist immediately (optimistic) via PUT /api/admin/settings. Shared
// by the built-in settings pages AND the VPN / Acquisition module pages.

import type { SettingGroup } from '@kromatv/client/admin';
import type { MessageKey } from '@kromatv/i18n';
import { useT } from '@kromatv/ui';
import {
  Box,
  CardSkeleton,
  Divider,
  PageHeader,
  Surface,
  Text,
  useStableCallback,
} from '@kromatv/ui/kit';
import { useEffect, useState } from 'react';
import { useAdminHost } from './context';
import { Denied } from './denied';
import { useCap } from './hooks';
import { ModuleFailed, ModuleLoading } from './page-states';
import { Row } from './row';
import { applySetting } from './apply-setting';

interface SettingsViewProps {
  view: string;
  titleKey: MessageKey;
  subtitleKey: MessageKey;
  embedded?: boolean;
}

export function SettingsView(props: Readonly<SettingsViewProps>) {
  // Settings views require the `settings.manage` capability (server enforces it
  // too); deny cleanly instead of rendering a page that would 403 on every call.
  if (!useCap('settings.manage')) return <Denied />;
  return <SettingsViewInner {...props} />;
}

function SettingsViewInner({ view, titleKey, subtitleKey, embedded }: Readonly<SettingsViewProps>) {
  const t = useT();
  const { client } = useAdminHost();
  // `null` is "not answered yet"; an empty array is a view with no groups.
  const [groups, setGroups] = useState<SettingGroup[] | null>(null);
  const [failed, setFailed] = useState<{
    error: unknown;
    view: typeof view;
    attempt: number;
  } | null>(null);
  const [saved, setSaved] = useState(false);

  // One fetch, reused as the retry: a view that failed offers to ask again
  // rather than stranding the page on an empty panel.
  const [attempt, setAttempt] = useState(0);
  // oxlint-disable-next-line react-hooks/exhaustive-deps -- `attempt` is an intentional re-run key (the retry), not something the effect reads
  useEffect(() => {
    let active = true;
    client.admin
      .settings(view)
      .then((r) => active && setGroups(r.groups))
      .catch((e: unknown) => active && setFailed({ error: e, view, attempt }));
    return () => {
      active = false;
    };
  }, [client, view, attempt]);

  const set = useStableCallback((key: string, value: unknown) => {
    setGroups((gs) => (gs ? applySetting(gs, key, value) : gs));
    client.admin
      .updateSettings({ [key]: value })
      .then(() => {
        setSaved(true);
        setTimeout(() => setSaved(false), 1500);
      })
      .catch(() => undefined);
  });

  const failure = failed?.view === view && failed.attempt === attempt ? failed : null;

  // Before the first answer there is nothing to show and nothing to claim: an
  // empty page would read as a settings view with no settings in it.
  if (!groups) {
    if (failure) {
      return <ModuleFailed error={failure.error} retry={() => setAttempt((n) => n + 1)} />;
    }
    return embedded ? <CardSkeleton fields={3} /> : <ModuleLoading panels={2} />;
  }

  return (
    <Box gap={embedded ? 0 : 24}>
      {embedded ? null : (
        <PageHeader.Root>
          <PageHeader.Title>{t(titleKey)}</PageHeader.Title>
          <PageHeader.Subtitle>{t(subtitleKey)}</PageHeader.Subtitle>
          {saved ? (
            <PageHeader.Actions>
              <Text variant="meta" color="success">
                {t('admin.saved')}
              </Text>
            </PageHeader.Actions>
          ) : null}
        </PageHeader.Root>
      )}
      <Box gap={22}>
        {groups.map((g) => (
          <Surface key={g.title} pad="none" overflow="hidden">
            <Box px={22} py={17} gap={3}>
              <Text variant="title">{g.title}</Text>
              {g.desc ? (
                <Text variant="meta" color="textDim">
                  {g.desc}
                </Text>
              ) : null}
            </Box>
            <Divider spacing={0} />
            {g.rows.map((r, i) => (
              <Box key={r.key}>
                {i > 0 ? <Divider spacing={0} /> : null}
                <Row row={r} onChange={set} />
              </Box>
            ))}
          </Surface>
        ))}
      </Box>
    </Box>
  );
}
