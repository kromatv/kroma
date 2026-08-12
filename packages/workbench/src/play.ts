// Running a story's `play` against what is on the stage, and recording what
// happened as it happens.

import { useCallback, useEffect, useState } from 'react';
import { actions, DEFAULT_TIMEOUT, type Stage } from './play-context';
import { fiberFor } from './play-tree';
import type { PlayContext, PlayFunction, PlayStep, PlayTranscript } from './play-types';

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

interface Recorder {
  steps: PlayStep[];
  emit: () => void;
  claim: (error: unknown) => string | undefined;
}

function stepper(record: Recorder): PlayContext['step'] {
  let depth = 0;
  let next = 0;
  return async (label, body) => {
    const entry: PlayStep = { id: next++, label, depth, status: 'running' };
    record.steps.push(entry);
    record.emit();
    depth += 1;
    try {
      await body();
      entry.status = 'passed';
    } catch (error) {
      entry.status = 'failed';
      entry.error = record.claim(error);
      throw error;
    } finally {
      depth -= 1;
      record.emit();
    }
  };
}

interface RunPlay {
  play: PlayFunction;
  /** The host node the story is rendered into: whatever a `ref` handed back. */
  stage: object;
  onProgress?: (transcript: PlayTranscript) => void;
  timeout?: number;
}

/** Runs a play to completion, reporting the transcript at every step. Never
 * rejects: a play that throws finishes `failed` with the message. */
async function runPlay(at: RunPlay): Promise<PlayTranscript> {
  const steps: PlayStep[] = [];
  // A failure is described once, by the innermost step that saw it; the ones it
  // unwinds through are failed without repeating the message.
  const claimed = new WeakSet<object>();
  const claim = (error: unknown) => {
    const key = typeof error === 'object' && error !== null ? error : null;
    if (key && claimed.has(key)) return undefined;
    if (key) claimed.add(key);
    return messageOf(error);
  };
  const snapshot = (status: PlayTranscript['status'], error?: string): PlayTranscript => ({
    status,
    steps: steps.map((step) => ({ ...step })),
    error,
  });
  const emit = () => at.onProgress?.(snapshot('running'));

  const stage: Stage = {
    root: () => fiberFor(at.stage),
    timeout: at.timeout ?? DEFAULT_TIMEOUT,
  };

  emit();
  try {
    await at.play({ ...actions(stage), step: stepper({ steps, emit, claim }) });
  } catch (error) {
    const failed = snapshot('failed', claim(error));
    at.onProgress?.(failed);
    return failed;
  }
  const passed = snapshot('passed');
  at.onProgress?.(passed);
  return passed;
}

const IDLE: PlayTranscript = { status: 'pending', steps: [] };

interface PlayRunner extends PlayTranscript {
  /** The stage's `ref`: the host node the story renders into. */
  stage: (node: unknown) => void;
  replay: () => void;
  playable: boolean;
}

/** Runs `play` once the stage has mounted, and again on `replay`. A new play
 * function - a different story - restarts it. */
function usePlay(play: PlayFunction | undefined, timeout?: number): PlayRunner {
  const [node, setNode] = useState<object | null>(null);
  const [take, setTake] = useState(0);
  const [transcript, setTranscript] = useState<PlayTranscript>(IDLE);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `take` IS the replay; there is nothing in it for the effect to read
  useEffect(() => {
    if (!play || !node) {
      setTranscript(IDLE);
      return;
    }
    let live = true;
    setTranscript({ status: 'running', steps: [] });
    void runPlay({
      play,
      stage: node,
      timeout,
      onProgress: (next) => {
        if (live) setTranscript(next);
      },
    });
    return () => {
      live = false;
    };
  }, [play, node, timeout, take]);

  const stage = useCallback((next: unknown) => setNode((next ?? null) as object | null), []);
  const replay = useCallback(() => setTake((count) => count + 1), []);

  return { ...transcript, stage, replay, playable: Boolean(play) };
}

export type { PlayRunner, RunPlay };
export { runPlay, usePlay };
