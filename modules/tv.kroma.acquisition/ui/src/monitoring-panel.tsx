import { apiErrorText } from '@kromatv/client';
import { type SlotProps, useAsyncAction, useCap, useT } from '@kromatv/module-sdk';
import { Badge, Box, Button, Callout, CardSkeleton, Section, useBreakpoint } from '@kromatv/ui/kit';
import { useAcquisitionApi } from './api';
import { SearchResultsDialog } from './search-results-dialog';
import { TitleFilesTable } from './title-files-table';
import { TitleProfilePicker } from './title-profile-picker';
import { TitleSearchBar } from './title-search-bar';
import { useRules, useTitleRules } from './use-rules';
import { useTitleSearch } from './use-title-search';

export function MonitoringPanel({
  kind,
  tmdbId,
  monitored,
}: Readonly<SlotProps['monitoring.detail']>) {
  const t = useT();
  const title = useTitleRules(kind, tmdbId);
  const rules = useRules();
  const search = useTitleSearch(kind, tmdbId);
  const acquisition = useAcquisitionApi();
  const profile = useAsyncAction();
  const narrow = useBreakpoint() === 'base';
  const library = useCap('library.manage');
  const requests = useCap('requests.manage');
  const settings = useCap('settings.manage');
  const canGrab = library || requests || settings;

  const pick = (profileId: string | null) =>
    profile.run(
      async () => {
        await acquisition.setTitleProfile(kind, tmdbId, profileId);
        await title.reload();
      },
      (e) => apiErrorText(e, t('requests.actionFailed')),
    );

  const controls = (
    <>
      {title.data ? (
        <TitleProfilePicker
          view={title.data}
          rules={rules.data}
          busy={profile.busy}
          onPick={pick}
        />
      ) : null}
      <TitleSearchBar kind={kind} busy={search.state.busy} onSearch={search.run} />
    </>
  );

  return (
    <Section.Root gap={14}>
      <Section.Header>
        <Section.Title>{t('acq.titleQuality')}</Section.Title>
        {title.data?.cutoffUnmet ? <Badge tone="warning">{t('acq.belowTarget')}</Badge> : null}
        {narrow ? null : <Section.Actions>{controls}</Section.Actions>}
      </Section.Header>

      {narrow ? <Box gap={10}>{controls}</Box> : null}

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

      {profile.error ? (
        <Callout.Root tone="danger">
          <Callout.Title>{profile.error}</Callout.Title>
        </Callout.Root>
      ) : null}

      {monitored ? null : (
        <Callout.Root tone="neutral" icon="eye-off">
          <Callout.Title>{t('acq.notMonitored')}</Callout.Title>
          <Callout.Detail>{t('acq.notMonitoredHint')}</Callout.Detail>
        </Callout.Root>
      )}

      {title.loading ? <CardSkeleton fields={3} /> : null}

      {title.data ? <TitleFilesTable files={title.data.files} /> : null}

      <SearchResultsDialog
        state={search.state}
        canGrab={canGrab}
        onGrab={search.grab}
        onClose={search.reset}
      />
    </Section.Root>
  );
}
