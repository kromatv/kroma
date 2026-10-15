import type { DownloadId } from '@kromatv/client/watchable';
import { useEffect, useState } from 'react';
import type { WatchableTarget } from '../watchable';

export type FileRead<T> = (id: DownloadId, file: number) => Promise<T>;

export interface FileAnswerOptions<T> {
  read: FileRead<T> | undefined;
  target: WatchableTarget | null;
  none: T;
  everyMs: number;
  asksAgain: (answer: T) => boolean;
}

/**
 * The answer is kept against the file it was asked about and reads as `none` the
 * moment another file is followed; a refused read leaves the last answer
 * standing. `asksAgain` must not change identity between renders.
 */
export function useFileAnswer<T>(opts: Readonly<FileAnswerOptions<T>>): T {
  const { read, target, none, everyMs, asksAgain } = opts;
  const id = target?.entry.id ?? null;
  const file = target?.file.index ?? null;
  const followed = `${id}:${file}`;
  const [answered, setAnswered] = useState<{ file: string; answer: T } | null>(null);

  useEffect(() => {
    if (!read || id === null || file === null) return;
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const ask = async () => {
      const got = await read(id, file).then(
        (answer) => ({ answer }),
        () => null,
      );
      if (!live) return;
      if (got) setAnswered({ file: `${id}:${file}`, answer: got.answer });
      if (got && !asksAgain(got.answer)) return;
      timer = setTimeout(() => void ask(), everyMs);
    };
    void ask();
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [read, id, file, everyMs, asksAgain]);

  return answered?.file === followed ? answered.answer : none;
}
