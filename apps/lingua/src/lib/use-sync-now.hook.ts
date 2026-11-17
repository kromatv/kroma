import { useRouter } from '@tanstack/react-router';
import { useState } from 'react';
import { ApiError, type Repository, syncRepository } from '#site/lib/api-client';

const MAX_ROUNDS = 40;
const BETWEEN = 400;
const WHILE_BUSY = 2000;

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** What one call to the sync route came to, for the loop that keeps a sync going. */
type Round =
  | { kind: 'answered'; repository: Repository }
  | { kind: 'busy' }
  | { kind: 'failed'; message: string };

async function round(project: string): Promise<Round> {
  try {
    return { kind: 'answered', repository: await syncRepository(project) };
  } catch (error) {
    if (error instanceof ApiError && error.status === 409) {
      return { kind: 'busy' };
    }
    return {
      kind: 'failed',
      message: error instanceof ApiError ? error.message : 'The sync could not start.',
    };
  }
}

/**
 * A repository's sync, started by hand: `run` keeps reading, one request at a
 * time, until the branch is read in full, the sync fails, or another pass that
 * holds the repository finishes. `live` is the latest answer, `error` why it stopped.
 */
export function useSyncNow(project: string) {
  const router = useRouter();
  const [live, setLive] = useState<Repository | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const step = async (left: number): Promise<void> => {
    const answer = await round(project);
    if (answer.kind === 'failed') {
      setError(answer.message);
      return;
    }
    if (answer.kind === 'answered') {
      setLive(answer.repository);
    }
    const goesOn = answer.kind === 'busy' || answer.repository.sync.kind === 'reading';
    if (goesOn && left > 1) {
      await pause(answer.kind === 'busy' ? WHILE_BUSY : BETWEEN);
      await step(left - 1);
    }
  };

  const run = async () => {
    setRunning(true);
    setError(null);
    await step(MAX_ROUNDS);
    setRunning(false);
    await router.invalidate();
  };

  return { live, running, error, run };
}
