import { apiErrorText } from '@kromatv/client';
import { type SlotProps, useAsyncAction, useCap, useT } from '@kromatv/module-sdk';
import { Box, Button, Callout, CardSkeleton, Row, Select, Surface, Text } from '@kromatv/ui/kit';
import { useAcquisitionApi } from './api';
import type { RulesView, TitleRulesView } from './rules-schemas';
import { SearchResultsDialog } from './search-results-dialog';
import { TitleFilesTable } from './title-files-table';
import { TitleSearchBar } from './title-search-bar';
import { useRules, useTitleRules } from './use-rules';
import { useTitleSearch } from './use-title-search';

const DEFAULT_PROFILE = '';

export function MonitoringPanel({
  kind,
  tmdbId,
  monitored,
}: Readonly<SlotProps['monitoring.detail']>) {
  const t = useT();
  const title = useTitleRules(kind, tmdbId);
  const rules = useRules();
  const search = useTitleSearch(kind, tmdbId);
  const library = useCap('library.manage');
  const requests = useCap('requests.manage');
  const settings = useCap('settings.manage');
  const canGrab = library || requests || settings;

  return (
    <Surface elevated radius="xl" pad="lg">
      <Box gap={14}>
        <Row wrap between gap={12} align="flex-start">
          <Box flex minW={160}>
            <Text variant="title" accessibilityRole="header">
              {t('acq.titleQuality')}
            </Text>
            {title.data?.cutoffUnmet ? (
              <Text variant="meta" color="accentText" mt={2}>
                {t('acq.belowTarget')}
              </Text>
            ) : null}
          </Box>
          <TitleSearchBar kind={kind} busy={search.state.busy} onSearch={search.run} />
        </Row>

        {title.failed ? (
          <Callout.Root tone="danger">
            <Callout.Title>{t('acq.titleRulesFailed')}</Callout.Title>
            <Callout.Detail>{apiErrorText(title.error, '')}</Callout.Detail>
            <Callout.Actions>
              <Button
                variant="ghost"
                size="sm"
                icon="refresh"
                label={t('error.retry')}
                onPress={() => void title.reload()}
              />
            </Callout.Actions>
          </Callout.Root>
        ) : null}

        {monitored ? null : (
          <Callout.Root tone="neutral" icon="eye-off">
            <Callout.Title>{t('acq.notMonitored')}</Callout.Title>
            <Callout.Detail>{t('acq.notMonitoredHint')}</Callout.Detail>
          </Callout.Root>
        )}

        {title.loading ? <CardSkeleton fields={3} /> : null}

        {title.data ? (
          <>
            <ProfilePicker
              view={title.data}
              rules={rules.data}
              kind={kind}
              tmdbId={tmdbId}
              onChanged={title.reload}
            />
            <TitleFilesTable files={title.data.files} />
          </>
        ) : null}
      </Box>

      <SearchResultsDialog
        state={search.state}
        canGrab={canGrab}
        onGrab={search.grab}
        onClose={search.reset}
      />
    </Surface>
  );
}

function ProfilePicker({
  view,
  rules,
  kind,
  tmdbId,
  onChanged,
}: Readonly<{
  view: TitleRulesView;
  rules: RulesView | null;
  kind: SlotProps['monitoring.detail']['kind'];
  tmdbId: number;
  onChanged: () => Promise<void>;
}>) {
  const t = useT();
  const acquisition = useAcquisitionApi();
  const action = useAsyncAction();
  const picked = view.customProfile ? view.profileId : DEFAULT_PROFILE;

  const pick = (next: string) =>
    action.run(
      async () => {
        await acquisition.setTitleProfile(kind, tmdbId, next === DEFAULT_PROFILE ? null : next);
        await onChanged();
      },
      (e) => apiErrorText(e, t('requests.actionFailed')),
    );

  return (
    <Box gap={8}>
      <Row wrap gap={10} align="center">
        <Text variant="meta" color="textMuted">
          {t('acq.colProfile')}
        </Text>
        <Box w={240}>
          <Select.Root
            label={t('acq.colProfile')}
            value={picked}
            disabled={rules === null || action.busy}
            onValueChange={pick}
          >
            <Select.Trigger size="sm" block />
            <Select.Item
              value={DEFAULT_PROFILE}
              label={t('acq.profileFollowsDefault', { name: defaultName(rules) })}
            />
            {(rules?.profiles ?? []).map((profile) => (
              <Select.Item key={profile.id} value={profile.id} label={profile.name} />
            ))}
          </Select.Root>
        </Box>
        <Text variant="meta" color="textDim">
          {view.profileName}
        </Text>
      </Row>
      {action.error ? (
        <Callout.Root tone="danger">
          <Callout.Title>{action.error}</Callout.Title>
        </Callout.Root>
      ) : null}
    </Box>
  );
}

function defaultName(rules: RulesView | null): string {
  const found = rules?.profiles.find((profile) => profile.id === rules.defaultProfile);
  return found?.name ?? '';
}
