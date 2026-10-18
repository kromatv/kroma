import { Box, FocusScope, MediaCard, PosterCard } from '@kromatv/ui/kit';
import { createRef, type ReactElement, type Ref, useImperativeHandle, useState } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';

interface MountReport {
  card: string;
  count: number;
  runs: number[];
  perCard: number;
}

const tint = (n: number): [string, string] => [
  `hsl(${(n * 37) % 360} 30% 24%)`,
  `hsl(${(n * 37) % 360} 30% 12%)`,
];

function cards(kind: string, count: number, round: number, recycle: boolean): ReactElement[] {
  return Array.from({ length: count }, (_, at) => {
    const seed = round * count + at;
    const key = recycle ? at : seed;
    return kind === 'poster' ? (
      <PosterCard
        key={key}
        title={`Title ${seed}`}
        overline="Film"
        art={null}
        tint={tint(seed)}
        width={203}
        onPress={() => {}}
      />
    ) : (
      <MediaCard
        key={key}
        title={`Title ${seed}`}
        overline="Film"
        art={null}
        tint={tint(seed)}
        width={328}
        onPress={() => {}}
      />
    );
  });
}

interface StageHandle {
  show: (round: number | null) => void;
}

function Stage({
  kind,
  count,
  recycle,
  ref,
}: Readonly<{ kind: string; count: number; recycle: boolean; ref: Ref<StageHandle> }>) {
  const [round, setRound] = useState<number | null>(null);
  useImperativeHandle(ref, () => ({ show: setRound }), []);
  return (
    <FocusScope>
      <Box row wrap gap={24} p={24}>
        {round === null ? null : cards(kind, count, round, recycle)}
      </Box>
    </FocusScope>
  );
}

/** Mounts `count` cards `runs` times, each one in its own synchronous commit,
 *  and reports how long a commit took per card. With `recycle`, the cards stay
 *  mounted and each run hands them the next titles instead. */
export function mountBench(params: URLSearchParams, root: HTMLElement): void {
  const kind = params.get('mount') ?? 'poster';
  const count = Number(params.get('n') ?? 32);
  const runs = Number(params.get('runs') ?? 12);
  const recycle = params.has('recycle');
  const stage = createRef<StageHandle>();
  createRoot(root).render(<Stage kind={kind} count={count} recycle={recycle} ref={stage} />);
  const show = (round: number | null) => stage.current?.show(round);
  const report: MountReport = { card: kind, count, runs: [], perCard: 0 };
  const go = async () => {
    await new Promise((done) => setTimeout(done, 500));
    if (recycle) flushSync(() => show(-1));
    await new Promise((done) => setTimeout(done, 60));
    for (let round = 0; round < runs; round += 1) {
      const start = performance.now();
      flushSync(() => show(round));
      report.runs.push(performance.now() - start);
      await new Promise((done) => setTimeout(done, 60));
      if (recycle) continue;
      flushSync(() => show(null));
      await new Promise((done) => setTimeout(done, 60));
    }
    const sorted = [...report.runs].sort((a, b) => a - b);
    report.perCard = (sorted[Math.floor(sorted.length / 2)] ?? 0) / count;
    (globalThis as { KROMA_MOUNT?: MountReport }).KROMA_MOUNT = report;
  };
  void go();
}
