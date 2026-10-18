import { useEffect, useMemo, useState } from 'react';
import { useAcquisitionApi } from './api';
import type { MatchedFormat } from './judgement-schemas';
import { allowedQualities } from './profile-draft';
import type { QualityId, QualityProfile } from './rules-schemas';

const SAMPLE_NAMES: readonly string[] = [
  'Serie.S01E01.MULTi.VFF.1080p.WEB-DL.x264-GRP',
  'Serie.S01E01.MULTi.VFQ.1080p.WEB-DL.x265-GRP',
  'Serie.S01E01.MULTi.1080p.BluRay.x265-GRP',
  'Serie.S01E01.VOSTFR.2160p.WEB-DL.x265-GRP',
  'Serie.S01E01.1080p.WEB-DL.x264-GRP',
];

const DEBOUNCE_MS = 400;

interface Sample {
  name: string;
  quality: QualityId;
  formats: readonly MatchedFormat[];
}

export interface RankedSample {
  name: string;
  quality: QualityId;
  score: number;
  rank: number | null;
}

export interface RankingPreview {
  busy: boolean;
  failed: boolean;
  rows: readonly RankedSample[];
}

export function useRankingPreview(profile: QualityProfile): RankingPreview {
  const acquisition = useAcquisitionApi();
  const [samples, setSamples] = useState<Sample[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    const timer = setTimeout(() => {
      Promise.all(SAMPLE_NAMES.map((name) => acquisition.testRules(name, 'en')))
        .then((views) => {
          if (!live) return;
          setSamples(
            views.map((view, at) => ({
              name: SAMPLE_NAMES[at] as string,
              quality: view.profiles[0]?.evaluation.quality ?? 'unknown',
              formats: view.profiles[0]?.evaluation.formats ?? [],
            })),
          );
        })
        .catch(() => {
          if (live) setFailed(true);
        });
    }, DEBOUNCE_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [acquisition]);

  const rows = useMemo(() => (samples ? rank(samples, profile) : []), [samples, profile]);
  return { busy: samples === null && !failed, failed, rows };
}

function rank(samples: readonly Sample[], profile: QualityProfile): RankedSample[] {
  const ladder = allowedQualities(profile);
  const scored = samples.map((sample) => {
    const at = ladder.indexOf(sample.quality);
    return {
      name: sample.name,
      quality: sample.quality,
      score: sample.formats.reduce(
        (sum, format) => sum + (profile.formatScores[format.id] ?? 0),
        0,
      ),
      rank: at === -1 ? null : at,
    };
  });
  return scored.sort(better);
}

function better(a: RankedSample, b: RankedSample): number {
  if (a.rank === null || b.rank === null) return Number(a.rank === null) - Number(b.rank === null);
  return a.rank - b.rank || b.score - a.score;
}
