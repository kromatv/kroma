import { apiErrorText } from '@kromatv/client';
import { type SlotProps, useAsyncAction, useT } from '@kromatv/module-sdk';
import {
  Button,
  Callout,
  CardSkeleton,
  Section,
  Text,
  toast,
  useBreakpoint,
} from '@kromatv/ui/kit';
import { useAcquisitionApi } from './api';
import { targetOf } from './quality-target';
import { TitleFilesTable } from './title-files-table';
import { TitleProfilePicker } from './title-profile-picker';
import { useQualityLabel } from './use-quality-label';
import { useRules, useTitleRules } from './use-rules';

export function MonitoringPanel({
  kind,
  tmdbId,
  monitored,
}: Readonly<SlotProps['monitoring.detail']>) {
  const t = useT();
  const title = useTitleRules(kind, tmdbId);
  const rules = useRules();
  const acquisition = useAcquisitionApi();
  const profileAction = useAsyncAction();
  const narrow = useBreakpoint() === 'base';

  const profile = rules.data?.profiles.find((one) => one.id === title.data?.profileId);
  const below = (title.data?.files ?? []).filter((file) => file.belowTarget).length;

  const pick = (profileId: string | null) =>
    profileAction.run(
      async () => {
        await acquisition.setTitleProfile(kind, tmdbId, profileId);
        await title.reload();
        toast({ message: t('acq.profileChanged'), tone: 'success', icon: 'check' });
      },
      (e) => apiErrorText(e, t('requests.actionFailed')),
    );

  const picker = title.data ? (
    <TitleProfilePicker
      view={title.data}
      rules={rules.data}
      busy={profileAction.busy}
      onPick={pick}
    />
  ) : null;

  return (
    <Section.Root gap={14}>
      <Section.Header>
        <Section.Title>{t('acq.titleQuality')}</Section.Title>
        {narrow ? null : <Section.Actions>{picker}</Section.Actions>}
      </Section.Header>

      {narrow ? picker : null}

      <TargetLine profile={profile} />

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

      {monitored ? null : (
        <Callout.Root tone="neutral" icon="radar-off">
          <Callout.Title>{t('acq.notFollowed')}</Callout.Title>
          <Callout.Detail>{t('acq.notFollowedHint')}</Callout.Detail>
        </Callout.Root>
      )}

      <BelowTargetNotice below={below} />

      {title.loading ? <CardSkeleton fields={3} /> : null}

      {title.data ? (
        <TitleFilesTable kind={kind} files={title.data.files} profile={profile} />
      ) : null}
    </Section.Root>
  );
}

function TargetLine({ profile }: Readonly<{ profile: Parameters<typeof targetOf>[0] }>) {
  const t = useT();
  const label = useQualityLabel();
  const target = targetOf(profile);
  if (!target) return null;
  return (
    <Text variant="meta" color="textDim">
      {target.upgradeUntilScore === 0
        ? t('acq.targetQuality', { cutoff: label(target.cutoff) })
        : t('acq.targetLine', { cutoff: label(target.cutoff), score: target.upgradeUntilScore })}
    </Text>
  );
}

function BelowTargetNotice({ below }: Readonly<{ below: number }>) {
  const t = useT();
  if (below === 0) return null;
  return (
    <Callout.Root tone="accent" icon="alert-triangle">
      <Callout.Title>{t('acq.belowTargetCount', { count: below })}</Callout.Title>
      <Callout.Detail>{t('acq.belowTargetHint')}</Callout.Detail>
    </Callout.Root>
  );
}
