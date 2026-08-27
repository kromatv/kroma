import { useAcquisitionApi } from '@kroma/module-acquisition/api';
import type { TorrentAnalysis } from '@kroma/module-acquisition/schemas';
import { apiErrorText, useAsyncAction, useT } from '@kroma/module-sdk';
import { Box, Button, Callout, Dialog, Row, Stepper, Text, useStepper } from '@kroma/ui/kit';
import { useState } from 'react';
import { detect } from './manual-grab-content';
import { useIndexerSearch } from './manual-grab-search';
import { SourceStep, type TorrentSource } from './manual-grab-source';
import { type GrabTarget, type Kind, TargetStep } from './manual-grab-target';
import { TorrentContents } from './torrent-contents';
import { useEpisodeNames } from './use-episode-names';

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

function targetFrom(source: TorrentSource): GrabTarget {
  return {
    kind: (source.kind as Kind) || 'movie',
    tmdbId: null,
    title: source.title,
    year: source.year ? String(source.year) : '',
    season: source.season ? String(source.season) : '',
    episode: source.episodes?.[0] ? String(source.episodes[0]) : '',
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
  const [source, setSource] = useState<TorrentSource | null>(null);
  const [target, setTarget] = useState<GrabTarget>(EMPTY_TARGET);

  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<TorrentAnalysis | null>(null);
  const [analyzeErr, setAnalyzeErr] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const search = useIndexerSearch(target.kind, target.season, target.episode);
  const episodeNames = useEpisodeNames(
    target.tmdbId,
    target.season ? Number.parseInt(target.season, 10) : null,
  );

  const takeSource = (picked: TorrentSource) => {
    setSource(picked);
    setTarget((current) => {
      const seeded = targetFrom(picked);
      return current.tmdbId ? { ...seeded, ...current } : seeded;
    });
    setStep('target');
    analyze(picked.magnet);
  };

  const analyze = (magnet: string) => {
    if (!magnet) return;
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
        if (!source) return;
        const onlyFiles =
          analysis && selected.size > 0 && selected.size < videoFiles.length
            ? [...selected].sort((a, b) => a - b)
            : null;
        await acquisition.add({
          magnetOrUrl: source.magnet,
          kind: target.kind,
          title: target.title.trim() || null,
          year: target.year ? Number.parseInt(target.year, 10) : null,
          season:
            target.kind !== 'movie' && target.season ? Number.parseInt(target.season, 10) : null,
          episode:
            target.kind === 'episode' && target.episode
              ? Number.parseInt(target.episode, 10)
              : null,
          tmdbId: target.tmdbId,
          onlyFiles,
          detailsUrl: source.detailsUrl,
        });
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
          <Stepper.Item value="files" icon="file-text" disabled={source === null}>
            <Stepper.Label>{t('manual.step.files')}</Stepper.Label>
          </Stepper.Item>
        </Stepper.List>

        <Stepper.Panel value="source">
          <SourceStep search={search} onPicked={takeSource} />
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

        <Stepper.Panel value="files">
          {source ? (
            <Box gap={12}>
              {analyzeErr ? (
                <Callout.Root size="sm" tone="danger" icon="alert-triangle">
                  <Callout.Title>{analyzeErr}</Callout.Title>
                  <Callout.Actions>
                    <Button
                      variant="glass"
                      size="sm"
                      label={t('manual.analyze')}
                      onPress={() => analyze(source.magnet)}
                      loading={analyzing}
                    />
                  </Callout.Actions>
                </Callout.Root>
              ) : null}
              {analyzing ? (
                <Text variant="meta" color="text/45">
                  {t('manual.analyzing')}
                </Text>
              ) : null}
              {analysis ? (
                <TorrentContents
                  analysis={analysis}
                  episodes={episodeNames}
                  selection={{ selected, onSelectedChange: setSelected }}
                />
              ) : null}
            </Box>
          ) : null}
        </Stepper.Panel>

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
