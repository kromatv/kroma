import {
  ArtScrim,
  Box,
  Focusable,
  FocusScope,
  Img,
  MediaCard,
  PosterCard,
  Text,
} from '@kromatv/ui/kit';
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

function part(kind: string, key: number, seed: number, art: string | null): ReactElement {
  if (kind === 'focusable') {
    return (
      <Focusable key={key} label={`Title ${seed}`} focusScale={1.05} onPress={() => {}}>
        <Box w={203} h={305} bg="surface1" />
      </Focusable>
    );
  }
  if (kind === 'content') {
    return (
      <Box key={key} w={203} aspect={2 / 3} radius="xl" overflow="hidden" bg="surface1">
        <Img src={art} fill />
        <ArtScrim variant="deep" />
        <Box absolute left={14} right={14} bottom={12} gap={3}>
          <Text lines={1}>Film</Text>
          <Text lines={2}>{`Title ${seed}`}</Text>
        </Box>
      </Box>
    );
  }
  if (kind === 'img') {
    return (
      <Box key={key} w={203} aspect={2 / 3}>
        <Img src={art} fill />
      </Box>
    );
  }
  if (kind === 'text') {
    return (
      <Box key={key} w={203}>
        <Text lines={1}>Film</Text>
        <Text lines={2}>{`Title ${seed}`}</Text>
      </Box>
    );
  }
  if (kind === 'scrim') {
    return (
      <Box key={key} w={203} aspect={2 / 3}>
        <ArtScrim variant="deep" />
      </Box>
    );
  }
  return (
    <Box key={key} w={203} h={305}>
      <Box>
        <Box>
          <Box />
          <Box />
        </Box>
        <Box />
      </Box>
    </Box>
  );
}

function cards(
  kind: string,
  count: number,
  round: number,
  recycle: boolean,
  art: readonly string[],
): ReactElement[] {
  return Array.from({ length: count }, (_, at) => {
    const seed = round * count + at;
    const key = recycle ? at : seed;
    const picture = art.length ? (art[seed % art.length] ?? null) : null;
    if (kind !== 'poster' && kind !== 'media') return part(kind, key, seed, picture);
    return kind === 'poster' ? (
      <PosterCard
        key={key}
        title={`Title ${seed}`}
        overline="Film"
        art={picture}
        tint={tint(seed)}
        width={203}
        onPress={() => {}}
      />
    ) : (
      <MediaCard
        key={key}
        title={`Title ${seed}`}
        overline="Film"
        art={picture}
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
  art,
  ref,
}: Readonly<{
  kind: string;
  count: number;
  recycle: boolean;
  art: readonly string[];
  ref: Ref<StageHandle>;
}>) {
  const [round, setRound] = useState<number | null>(null);
  useImperativeHandle(ref, () => ({ show: setRound }), []);
  return (
    <FocusScope>
      <Box row wrap gap={24} p={24}>
        {round === null ? null : cards(kind, count, round, recycle, art)}
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
  const art = (params.get('art') ?? '').split(',').filter((url) => url.startsWith('http'));
  const stage = createRef<StageHandle>();
  createRoot(root).render(
    <Stage kind={kind} count={count} recycle={recycle} art={art} ref={stage} />,
  );
  const show = (round: number | null) => stage.current?.show(round);
  const report: MountReport = { card: kind, count, runs: [], perCard: 0 };
  const go = async () => {
    await new Promise((done) => setTimeout(done, 500));
    if (recycle) flushSync(() => show(-1));
    await new Promise((done) => setTimeout(done, 60));
    const measure = async (round: number): Promise<void> => {
      if (round >= runs) return;
      const start = performance.now();
      flushSync(() => show(round));
      report.runs.push(performance.now() - start);
      await new Promise((done) => setTimeout(done, 60));
      if (!recycle) {
        flushSync(() => show(null));
        await new Promise((done) => setTimeout(done, 60));
      }
      return measure(round + 1);
    };
    await measure(0);
    const sorted = [...report.runs].sort((a, b) => a - b);
    report.perCard = (sorted[Math.floor(sorted.length / 2)] ?? 0) / count;
    (globalThis as { KROMA_MOUNT?: MountReport }).KROMA_MOUNT = report;
  };
  void go();
}
