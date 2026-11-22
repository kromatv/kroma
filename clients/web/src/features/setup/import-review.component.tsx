import type { ImportCounts, ImportSurvey } from '@kromatv/client/importers';
import type { ImportFolder } from '@kromatv/client/imports';
import { useT } from '@kromatv/ui';
import { Box, Callout, GuidedFlow, Row, Skeleton, StatCard } from '@kromatv/ui/kit';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { foldersOf, placed, placesOf } from '#web/features/setup/import-folders';
import {
  type ImportTarget,
  importable,
  importRequest,
  keptLibraries,
} from '#web/features/setup/import-review';
import { useImportSession } from '#web/features/setup/import-session.component';
import { ReviewFolders } from '#web/features/setup/import-review-folders.component';
import { ReviewLibraries, ReviewUsers } from '#web/features/setup/import-review-lists.component';
import { leftBehindLine } from '#web/features/setup/import-words';
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

function usePlaces(target: ImportTarget, survey: ImportSurvey | undefined): ImportFolder[] {
  const { client } = useWebRuntime();
  const { session } = useImportSession();
  const folders = foldersOf((survey?.libraries ?? []).filter(importable));
  const { data } = useQuery({
    queryKey: ['setup', 'import-folders', target.importer, target.server, folders],
    queryFn: () =>
      client.imports.folders({ importer: target.importer, server: target.server, folders }),
    enabled: folders.length > 0,
    retry: false,
  });
  const found = data?.folders ?? folders.map((folder) => ({ folder }));
  return placed(found, session.folders);
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

interface SurveyProps {
  survey: ImportSurvey;
  places: readonly ImportFolder[];
}

function Survey({ survey, places }: Readonly<SurveyProps>) {
  const { session } = useImportSession();
  const kept = keptLibraries(survey.libraries, session.skippedLibraries);
  return (
    <>
      <Counts counts={survey.counts} />
      <ReviewLibraries libraries={survey.libraries} />
      <ReviewFolders places={placesOf(kept, places)} />
      <ReviewUsers users={survey.users} />
      <LeftBehind keys={survey.leftBehind} />
    </>
  );
}

function useStart(target: ImportTarget, review: Partial<SurveyProps>) {
  const { client } = useWebRuntime();
  const { session, update } = useImportSession();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const start = async () => {
    const { survey, places = [] } = review;
    if (!survey) {
      return;
    }
    setBusy(true);
    setFailed(false);
    const request = importRequest(target, { survey, choices: session, places });
    const started = await client.imports.start(request).catch(() => null);
    setBusy(false);
    setFailed(started === null);
    update({ running: started?.id ?? null });
  };
  return { busy, failed, start };
}

interface StartActionProps {
  busy: boolean;
  ready: boolean;
  onStart: () => void;
}

function StartAction({ busy, ready, onStart }: Readonly<StartActionProps>) {
  const t = useT();
  return (
    <GuidedFlow.Next
      label={t('setup.importStart')}
      loading={busy}
      disabled={!ready}
      onPress={onStart}
    />
  );
}

/** What the other server holds, before anything is written: its libraries,
 * its users, how much they watched, and what an import does not bring. The
 * owner leaves out what they do not want, then starts the import. */
export function ImportReview({ target, onBack }: Readonly<ReviewProps>) {
  const t = useT();
  const { data, error } = useSurvey(target);
  const places = usePlaces(target, data);
  const { busy, failed, start } = useStart(target, { survey: data, places });
  return (
    <>
      <GuidedFlow.Header>
        <GuidedFlow.Title>{t('setup.importReviewTitle')}</GuidedFlow.Title>
        <GuidedFlow.Subtitle>{t('setup.importReviewSub')}</GuidedFlow.Subtitle>
      </GuidedFlow.Header>
      <GuidedFlow.Panel>
        {data ? <Survey survey={data} places={places} /> : null}
        {!data && !error ? <Loading /> : null}
        <StepFailure error={error ? t('setup.importReviewFailed') : null} />
        <StepFailure error={failed ? t('setup.importStartFailed') : null} />
      </GuidedFlow.Panel>
      <GuidedFlow.Footer>
        <GuidedFlow.Previous onPress={onBack} />
        <GuidedFlow.Actions>
          <StartAction busy={busy} ready={data !== undefined} onStart={() => void start()} />
        </GuidedFlow.Actions>
      </GuidedFlow.Footer>
    </>
  );
}
