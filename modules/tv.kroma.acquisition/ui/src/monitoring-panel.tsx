import { apiErrorText } from '@kromatv/client';
import { type SlotProps, useAsyncAction, useT } from '@kromatv/module-sdk';
import { Button, Callout, CardSkeleton, Section, toast } from '@kromatv/ui/kit';
import { useAcquisitionApi } from './api';
import { QualityGoalCard } from './quality-goal-card';
import { goalOf } from './quality-target';
import { TitleFilesTable } from './title-files-table';
import { TitleProfilePicker } from './title-profile-picker';
import { UpgradeSearchButton } from './upgrade-search-button';
import { useRules, useTitleRules } from './use-rules';

export function MonitoringPanel({
  kind,
  tmdbId,
  title: name,
  monitored,
}: Readonly<SlotProps['monitoring.detail']>) {
  const t = useT();
  const title = useTitleRules(kind, tmdbId);
  const rules = useRules();
  const acquisition = useAcquisitionApi();
  const profileAction = useAsyncAction();

  const profile = rules.data?.profiles.find((one) => one.id === title.data?.profileId);
  const goal = goalOf(profile, rules.data?.formats ?? []);
  const files = title.data?.files ?? [];

  const pick = (profileId: string | null) =>
    profileAction.run(
      async () => {
        await acquisition.setTitleProfile(kind, tmdbId, profileId);
        await title.reload();
        toast({ message: t('acq.profileChanged'), tone: 'success', icon: 'check' });
      },
      (e) => apiErrorText(e, t('requests.actionFailed')),
    );

  return (
    <Section.Root gap={14}>
      <Section.Header>
        <Section.Title>{t('acq.titleQuality')}</Section.Title>
      </Section.Header>

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

      {profileAction.error ? (
        <Callout.Root tone="danger">
          <Callout.Title>{profileAction.error}</Callout.Title>
        </Callout.Root>
      ) : null}

      {title.data && goal ? (
        <QualityGoalCard
          goal={goal}
          files={files}
          picker={
            <TitleProfilePicker
              view={title.data}
              rules={rules.data}
              busy={profileAction.busy}
              onPick={pick}
            />
          }
          action={<UpgradeSearchButton kind={kind} tmdbId={tmdbId} title={name} files={files} />}
        />
      ) : null}

      {title.loading || rules.loading ? <CardSkeleton fields={3} /> : null}

      {monitored ? null : (
        <Callout.Root tone="neutral" icon="radar-off">
          <Callout.Title>{t('acq.notFollowed')}</Callout.Title>
          <Callout.Detail>{t('acq.notFollowedHint')}</Callout.Detail>
        </Callout.Root>
      )}

      {title.data ? <TitleFilesTable kind={kind} files={files} goal={goal} /> : null}
    </Section.Root>
  );
}
