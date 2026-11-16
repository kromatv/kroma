import { useAcquisitionApi } from '@kromatv/module-acquisition/api';
import type { ManualAddBody, TorrentAnalysis } from '@kromatv/module-acquisition/schemas';
import { apiErrorText, useAsyncAction, useT } from '@kromatv/module-sdk';
import { Button, Callout, Dialog, Row, Stepper, useStepper } from '@kromatv/ui/kit';
import { useState } from 'react';
import { detect } from './manual-grab-content';
import { FilesPanel } from './manual-grab-files.component';
import { useIndexerSearch } from './manual-grab-search';
import { type ReleaseSource, SourceStep } from './manual-grab-source.component';
import { type GrabTarget, type Kind, TargetStep } from './manual-grab-target.component';
import { joinsSwarm } from './protocol';
import { useClientProtocols } from './use-client-protocols.hook';
import { useEpisodeNames } from './use-episode-names.hook';

const FLOW = { gap: 22 } as const;
const BAR = { paddingHorizontal: 4 } as const;

const STEPS = ['source', 'target', 'files'] as const;
type Step = (typeof STEPS)[number];

const EMPTY_TARGET: GrabTarget = {
  kind: 'movie',
  tmdbId: null,
  title: '',
  year: '',
  season: '',
  episode: '',
};

function targetFrom(source: ReleaseSource): GrabTarget {
  return {
    kind: (source.kind as Kind) || 'movie',
    tmdbId: null,
    title: source.title,
    year: source.year ? String(source.year) : '',
    season: source.season ? String(source.season) : '',
    episode: source.episodes?.[0] ? String(source.episodes[0]) : '',
  };
}

function numberOf(text: string): number | null {
  return text ? Number.parseInt(text, 10) : null;
}

function addBody(
  source: ReleaseSource,
  target: GrabTarget,
  onlyFiles: number[] | null,
): ManualAddBody {
  return {
    magnetOrUrl: source.magnet,
    protocol: source.protocol,
    kind: target.kind,
    title: target.title.trim() || null,
    year: numberOf(target.year),
    season: target.kind === 'movie' ? null : numberOf(target.season),
    episode: target.kind === 'episode' ? numberOf(target.episode) : null,
    tmdbId: target.tmdbId,
    onlyFiles,
    detailsUrl: source.detailsUrl,
  };
}

export function ManualGrabModal({
  onClose,
  onAdded,
}: Readonly<{ onClose: () => void; onAdded: () => void }>) {
  const t = useT();
  const acquisition = useAcquisitionApi();
  const { busy, error, run } = useAsyncAction();

  const [step, setStep] = useState<Step>('source');
  const [source, setSource] = useState<ReleaseSource | null>(null);
  const [target, setTarget] = useState<GrabTarget>(EMPTY_TARGET);

  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<TorrentAnalysis | null>(null);
  const [analyzeErr, setAnalyzeErr] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const protocols = useClientProtocols();
  const hasFiles = source === null || joinsSwarm(source);
  const search = useIndexerSearch(target.kind, target.season, target.episode);
  const episodeNames = useEpisodeNames(
    target.tmdbId,
    target.season ? Number.parseInt(target.season, 10) : null,
  );

  const takeSource = (picked: ReleaseSource) => {
    setSource(picked);
    setTarget((current) => {
      const seeded = targetFrom(picked);
      return current.tmdbId ? { ...seeded, ...current } : seeded;
    });
    setStep('target');
    setAnalysis(null);
    setAnalyzeErr(null);
    if (joinsSwarm(picked)) {
      analyze(picked.magnet);
    }
  };

  const analyze = (magnet: string) => {
    if (!magnet) {
      return;
    }
    setAnalyzing(true);
    setAnalyzeErr(null);
    setAnalysis(null);
    acquisition
      .analyze(magnet)
      .then((found) => {
        setAnalysis(found);
        setSelected(new Set(found.files.filter((f) => f.isVideo).map((f) => f.index)));
        const content = detect(found);
        if (content.certain) {
          setTarget((current) => ({
            ...current,
            kind: content.kind,
            season: content.season,
            episode: content.episode,
          }));
        }
      })
      .catch((e) => setAnalyzeErr(apiErrorText(e, t('manual.analyzeFailed'))))
      .finally(() => setAnalyzing(false));
  };

  const videoFiles = analysis?.files.filter((f) => f.isVideo) ?? [];

  const add = () =>
    run(
      async () => {
        if (!source) {
          return;
        }
        const onlyFiles =
          analysis && selected.size > 0 && selected.size < videoFiles.length
            ? [...selected].sort((a, b) => a - b)
            : null;
        await acquisition.add(addBody(source, target, onlyFiles));
        onAdded();
        onClose();
      },
      (e) => apiErrorText(e, t('manual.addFailed')),
    );

  return (
    <Dialog.Root open title={t('manual.title')} onClose={onClose} width="lg">
      <Stepper.Root
        label={t('manual.title')}
        value={step}
        onValueChange={(next) => setStep(next as Step)}
        style={FLOW}
      >
        <Stepper.List style={BAR}>
          <Stepper.Item value="source" icon="search">
            <Stepper.Label>{t('manual.step.source')}</Stepper.Label>
          </Stepper.Item>
          <Stepper.Item value="target" icon="movie" disabled={source === null}>
            <Stepper.Label>{t('manual.step.target')}</Stepper.Label>
          </Stepper.Item>
          {hasFiles ? (
            <Stepper.Item value="files" icon="file-text" disabled={source === null}>
              <Stepper.Label>{t('manual.step.files')}</Stepper.Label>
            </Stepper.Item>
          ) : null}
        </Stepper.List>

        <Stepper.Panel value="source">
          <SourceStep search={search} protocols={protocols} onPicked={takeSource} />
        </Stepper.Panel>

        <Stepper.Panel value="target">
          {source ? (
            <TargetStep
              releaseTitle={source.releaseTitle}
              target={target}
              onTargetChange={setTarget}
              analysis={analysis}
              analyzing={analyzing}
              analyzeError={analyzeErr}
              onRetryAnalyze={() => analyze(source.magnet)}
            />
          ) : null}
        </Stepper.Panel>

        {hasFiles ? (
          <Stepper.Panel value="files">
            {source ? (
              <FilesPanel
                state={{ analysis, analyzing, analyzeErr }}
                onRetry={() => analyze(source.magnet)}
                episodes={episodeNames}
                selection={{ selected, onSelectedChange: setSelected }}
              />
            ) : null}
          </Stepper.Panel>
        ) : null}

        {error ? (
          <Callout.Root size="sm" tone="danger" icon="alert-triangle">
            <Callout.Title>{error}</Callout.Title>
          </Callout.Root>
        ) : null}

        <Footer busy={busy} onCancel={onClose} onAdd={add} />
      </Stepper.Root>
    </Dialog.Root>
  );
}

function Footer({
  busy,
  onCancel,
  onAdd,
}: Readonly<{ busy: boolean; onCancel: () => void; onAdd: () => void }>) {
  const t = useT();
  const flow = useStepper();

  if (flow.first) {
    return (
      <Row justify="flex-end" gap={8} mt={6}>
        <Button variant="ghost" label={t('common.cancel')} onPress={onCancel} />
      </Row>
    );
  }
  return (
    <Row between gap={8} mt={6}>
      <Stepper.Previous label={t('manual.back')} />
      <Row gap={8}>
        <Button variant="ghost" label={t('common.cancel')} onPress={onCancel} />
        {flow.last ? (
          <Button
            variant="primary"
            icon="download"
            label={busy ? t('manual.adding') : t('manual.add')}
            onPress={onAdd}
            loading={busy}
          />
        ) : (
          <Stepper.Next label={t('manual.next')} />
        )}
      </Row>
    </Row>
  );
}
