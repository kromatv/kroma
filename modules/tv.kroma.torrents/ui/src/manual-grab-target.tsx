// Step two of a manual add: which title this torrent is for.

import type { TorrentAnalysis } from '@kroma/module-acquisition/schemas';
import { useT } from '@kroma/module-sdk';
import { Badge, Box, Button, Callout, Field, Row, Spinner, Surface, Text } from '@kroma/ui/kit';
import { detect } from './manual-grab-content';
import type { MatchCandidateView } from './schemas';
import { TitlePicker } from './title-picker';

export type Kind = 'movie' | 'episode' | 'season';

const KIND_LABEL = {
  movie: 'manual.kindMovie',
  season: 'manual.kindSeason',
  episode: 'manual.kindEpisode',
} as const;

/** The title a grab is for, once an operator has settled it. */
export interface GrabTarget {
  kind: Kind;
  tmdbId: number | null;
  title: string;
  year: string;
  season: string;
  episode: string;
}

interface TargetStepProps {
  releaseTitle: string;
  target: GrabTarget;
  onTargetChange: (next: GrabTarget) => void;
  analysis: TorrentAnalysis | null;
  analyzing: boolean;
  analyzeError: string | null;
  onRetryAnalyze: () => void;
}

export function TargetStep({
  releaseTitle,
  target,
  onTargetChange,
  analysis,
  analyzing,
  analyzeError,
  onRetryAnalyze,
}: Readonly<TargetStepProps>) {
  const t = useT();
  const set = (patch: Partial<GrabTarget>) => onTargetChange({ ...target, ...patch });
  const found = analysis ? detect(analysis) : null;

  const pick = (candidate: MatchCandidateView) =>
    set({
      tmdbId: candidate.tmdbId,
      title: candidate.title,
      year: candidate.year ? String(candidate.year) : '',
    });

  return (
    <Box gap={14}>
      <AnalysisStatus analyzing={analyzing} error={analyzeError} onRetry={onRetryAnalyze} />

      {target.tmdbId ? (
        <Surface radius="xl" border="border" p={12}>
          <Row between gap={12} align="center">
            <Row gap={8} minW={0}>
              <Badge tone="success">{t('manual.linked')}</Badge>
              <Text variant="label" lines={1} shrink={1} minW={0}>
                {target.year ? `${target.title} (${target.year})` : target.title}
              </Text>
            </Row>
            <Button
              variant="ghost"
              size="sm"
              icon="x"
              label={t('manual.unlink')}
              onPress={() => set({ tmdbId: null })}
            />
          </Row>
        </Surface>
      ) : (
        <TitlePicker
          initialQuery={target.title || releaseTitle}
          kind={target.kind}
          year={target.year ? Number.parseInt(target.year, 10) : null}
          onPick={pick}
        />
      )}

      {found?.certain ? null : <ManualShape target={target} onChange={set} />}
    </Box>
  );
}

function AnalysisStatus({
  analyzing,
  error,
  onRetry,
}: Readonly<{ analyzing: boolean; error: string | null; onRetry: () => void }>) {
  const t = useT();
  if (analyzing) {
    return (
      <Row gap={8} align="center">
        <Spinner size={14} />
        <Text variant="meta" color="text/50">
          {t('manual.analyzing')}
        </Text>
      </Row>
    );
  }
  if (error) {
    return (
      <Callout.Root size="sm" tone="accent" icon="alert-triangle">
        <Callout.Title>{t('manual.contentUnknown')}</Callout.Title>
        <Callout.Actions>
          <Button variant="glass" size="sm" label={t('manual.analyze')} onPress={onRetry} />
        </Callout.Actions>
      </Callout.Root>
    );
  }
  return null;
}

function ManualShape({
  target,
  onChange,
}: Readonly<{ target: GrabTarget; onChange: (patch: Partial<GrabTarget>) => void }>) {
  const t = useT();
  return (
    <Box gap={10}>
      <Row gap={8} wrap align="center">
        <Text variant="meta" color="text/40">
          {t('manual.shapeLabel')}
        </Text>
        {(['movie', 'season', 'episode'] as const).map((kind) => (
          <Button
            key={kind}
            variant="outline"
            size="sm"
            label={t(KIND_LABEL[kind])}
            active={target.kind === kind}
            onPress={() => onChange({ kind })}
          />
        ))}
      </Row>
      {target.kind !== 'movie' ? (
        <Row gap={12}>
          <Field.Root
            label={t('manual.season')}
            value={target.season}
            onValueChange={(season) => onChange({ season })}
            flex
            size="sm"
          >
            <Field.Input placeholder="1" />
          </Field.Root>
          {target.kind === 'episode' ? (
            <Field.Root
              label={t('manual.episode')}
              value={target.episode}
              onValueChange={(episode) => onChange({ episode })}
              flex
              size="sm"
            >
              <Field.Input placeholder="1" />
            </Field.Root>
          ) : null}
        </Row>
      ) : null}
    </Box>
  );
}
