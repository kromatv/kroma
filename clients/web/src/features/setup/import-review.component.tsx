import type { ImportCounts, ImportSurvey } from '@kromatv/client/importers';
import { useT } from '@kromatv/ui';
import { Box, Button, Callout, Row, Skeleton, StatCard } from '@kromatv/ui/kit';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { type ImportTarget, importRequest } from '#web/features/setup/import-review';
import { useImportSession } from '#web/features/setup/import-session.component';
import { ReviewLibraries, ReviewUsers } from '#web/features/setup/import-review-lists.component';
import { leftBehindLine } from '#web/features/setup/import-words';
import { StepActions, StepBody, StepHeading } from '#web/features/setup/setup-shell.component';
import { StepFailure } from '#web/features/setup/step-failure.component';
import { useWebRuntime } from '#web/shared/lib/web-runtime';

interface ReviewProps {
  target: ImportTarget;
  onBack: () => void;
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

function useStart(target: ImportTarget, survey: ImportSurvey | undefined) {
  const { client } = useWebRuntime();
  const { session, update } = useImportSession();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const start = async () => {
    if (!survey) {
      return;
    }
    setBusy(true);
    setFailed(false);
    const request = importRequest(target, session, survey);
    const started = await client.imports.start(request).catch(() => null);
    setBusy(false);
    setFailed(started === null);
    update({ running: started?.id ?? null });
  };
  return { busy, failed, start };
}

/** What the other server holds, before anything is written: its libraries,
 * its users, how much they watched, and what an import does not bring. The
 * owner leaves out what they do not want, then starts the import. */
export function ImportReview({ target, onBack }: Readonly<ReviewProps>) {
  const t = useT();
  const { data, error } = useSurvey(target);
  const { busy, failed, start } = useStart(target, data);
  return (
    <>
      <StepHeading title={t('setup.importReviewTitle')} sub={t('setup.importReviewSub')} />
      <StepBody>
        {data ? <Survey survey={data} /> : null}
        {!data && !error ? <Loading /> : null}
        <StepFailure error={error ? t('setup.importReviewFailed') : null} />
        <StepFailure error={failed ? t('setup.importStartFailed') : null} />
      </StepBody>
      <StepActions onBack={onBack}>
        <Button
          size="md"
          icon="arrow-down-circle"
          label={t('setup.importStart')}
          loading={busy}
          disabled={!data}
          onPress={() => void start()}
        />
      </StepActions>
    </>
  );
}
