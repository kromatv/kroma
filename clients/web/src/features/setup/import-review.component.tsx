import type {
  ImportCounts,
  ImportServerId,
  ImportSignInId,
  ImportSurvey,
} from '@kromatv/client/importers';
import type { ModuleId } from '@kromatv/client/modules';
import { useT } from '@kromatv/ui';
import { Box, Button, Callout, Row, Skeleton, StatCard } from '@kromatv/ui/kit';
import { useQuery } from '@tanstack/react-query';
import { ReviewLibraries, ReviewUsers } from '#web/features/setup/import-review-lists.component';
import { leftBehindLine } from '#web/features/setup/import-words';
import { StepActions, StepBody, StepHeading } from '#web/features/setup/setup-shell.component';
import { StepFailure } from '#web/features/setup/step-failure.component';
import { useWebRuntime } from '#web/shared/lib/web-runtime';

/** The server an import reads: through which importer, with which sign-in. */
export interface ImportTarget {
  importer: ModuleId;
  signIn: ImportSignInId;
  server: ImportServerId;
}

interface ReviewProps {
  target: ImportTarget;
  onBack: () => void;
  onContinue: () => void;
}

const COUNTS = [
  ['titles', 'setup.importCountTitles'],
  ['states', 'setup.importCountStates'],
  ['plays', 'setup.importCountPlays'],
] as const;

function useSurvey({ importer, signIn, server }: ImportTarget) {
  const { client } = useWebRuntime();
  return useQuery({
    queryKey: ['setup', 'import-survey', importer, signIn, server],
    queryFn: () => client.importers.survey(importer, signIn, server),
    retry: false,
  });
}

function Counts({ counts }: Readonly<{ counts: ImportCounts }>) {
  const t = useT();
  return (
    <Row gap={8}>
      {COUNTS.map(([key, label]) => (
        <StatCard.Root key={key} flex pad="md">
          <StatCard.Label>{t(label)}</StatCard.Label>
          <StatCard.Value>{counts[key]?.toLocaleString() ?? '–'}</StatCard.Value>
        </StatCard.Root>
      ))}
    </Row>
  );
}

function LeftBehind({ keys }: Readonly<{ keys: readonly string[] }>) {
  const t = useT();
  if (keys.length === 0) {
    return null;
  }
  const lines = keys.map((key) => {
    const line = leftBehindLine(key);
    return line ? t(line) : key;
  });
  return (
    <Callout.Root tone="neutral" icon="info-circle" size="sm">
      <Callout.Title>{t('setup.importLeftTitle')}</Callout.Title>
      <Callout.Detail>{lines.join(' · ')}</Callout.Detail>
    </Callout.Root>
  );
}

function Loading() {
  return (
    <Box gap={8}>
      <Skeleton w="100%" h={88} radius="lg" />
      <Skeleton w="100%" h={64} radius="lg" />
      <Skeleton w="100%" h={64} radius="lg" />
    </Box>
  );
}

function Survey({ survey }: Readonly<{ survey: ImportSurvey }>) {
  return (
    <>
      <Counts counts={survey.counts} />
      <ReviewLibraries libraries={survey.libraries} />
      <ReviewUsers users={survey.users} />
      <LeftBehind keys={survey.leftBehind} />
    </>
  );
}

/** What the other server holds, before anything is written: its libraries,
 * its users, how much they watched, and what an import does not bring. The
 * owner leaves out what they do not want. */
export function ImportReview({ target, onBack, onContinue }: Readonly<ReviewProps>) {
  const t = useT();
  const { data, error } = useSurvey(target);
  return (
    <>
      <StepHeading title={t('setup.importReviewTitle')} sub={t('setup.importReviewSub')} />
      <StepBody>
        {data ? <Survey survey={data} /> : null}
        {!data && !error ? <Loading /> : null}
        <StepFailure error={error ? t('setup.importReviewFailed') : null} />
      </StepBody>
      <StepActions onBack={onBack}>
        <Button
          size="md"
          label={t('setup.continue')}
          iconRight="arrow-right"
          disabled={!data}
          onPress={onContinue}
        />
      </StepActions>
    </>
  );
}
