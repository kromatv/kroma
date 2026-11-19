import type { DeviceId, KromaClient } from '@kromatv/client';
import type { CastCommand, CastReceiver, CastWakeStep } from '@kromatv/client/cast';
import { runWakeSteps, type WakeReach } from '@kromatv/core';
import { useCallback, useEffect, useMemo, useState } from 'react';

type Play = Extract<CastCommand, { type: 'play' }>;

interface CastWakeOptions {
  client: KromaClient | null;
  receivers: CastReceiver[];
  /** What this platform can do to a television on its network. */
  reach: WakeReach;
  /** Called once when the television that was being brought back is in the roster, awake. */
  onArrived: (receiverId: DeviceId) => void;
  /** Called when it did not come back within `giveUpMs`. */
  onGaveUp: (receiverId: DeviceId) => void;
  /** How long a television may take to come back. Default 90 s. */
  giveUpMs?: number;
  /** How often the steps are run again while it has not arrived. Default 2.5 s. */
  everyMs?: number;
}

interface CastWake {
  /** The television being brought back right now, or null. */
  waking: DeviceId | null;
  /** Whether that television is off and this platform cannot switch it on, so
   * a person has to. It is still watched for, and opened once it is on. */
  needsPower: boolean;
  /** Ask the server for the steps that bring a television back, have `play`
   * start on it once it arrives, and run the steps from here until it does.
   * Rejects as the client does; the caller maps the failure. */
  wake: (receiverId: DeviceId, play?: Play) => Promise<void>;
}

interface Passes {
  reach: WakeReach;
  everyMs: number;
  onRefused: (id: DeviceId) => void;
}

interface Job {
  id: DeviceId;
  steps: CastWakeStep[];
}

const GIVE_UP_MS = 90_000;
const EVERY_MS = 2500;

function useGiveUp(job: Job | null, giveUpMs: number, onTimeout: (id: DeviceId) => void) {
  useEffect(() => {
    if (!job) {
      return undefined;
    }
    const timer = setTimeout(() => {
      onTimeout(job.id);
    }, giveUpMs);
    return () => clearTimeout(timer);
  }, [job, giveUpMs, onTimeout]);
}

function useArrival(arrival: { id: DeviceId } | null, onArrived: (id: DeviceId) => void) {
  useEffect(() => {
    if (arrival) {
      onArrived(arrival.id);
    }
  }, [arrival, onArrived]);
}

// The steps are run again and again until the television arrives: one pass
// switches it on, a later one finds it on and opens the app. A television that
// refuses is not asked again.
function usePasses(job: Job | null, run: Passes): boolean {
  const { reach, everyMs, onRefused } = run;
  const [needsPower, setNeedsPower] = useState(false);
  useEffect(() => {
    if (!job) {
      return undefined;
    }
    let live = true;
    const pass = async () => {
      const result = await runWakeSteps(job.steps, reach);
      if (!live) {
        return;
      }
      setNeedsPower(result === 'needsPower');
      if (result === 'refused') {
        onRefused(job.id);
      }
    };
    void pass();
    const timer = setInterval(() => void pass(), everyMs);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [job, reach, everyMs, onRefused]);
  return job !== null && needsPower;
}

async function stepsFor(client: KromaClient | null, id: DeviceId, play?: Play): Promise<Job> {
  if (!client) {
    throw new Error('no client');
  }
  const { steps } = await client.cast.wake(id, play);
  return { id, steps };
}

function hasArrived(job: Job, receivers: CastReceiver[]): boolean {
  return receivers.some((r) => r.id === job.id && !r.asleep);
}

/** Brings back a television the roster lists as `asleep`: asks the server for
 * the steps, runs them from here, and tracks the television until it arrives
 * or the wait runs out. The server reaches no television; this does. */
export function useCastWake(options: CastWakeOptions): CastWake {
  const { client, receivers, reach, onArrived, onGaveUp } = options;
  const [job, setJob] = useState<Job | null>(null);
  const [arrival, setArrival] = useState<{ id: DeviceId } | null>(null);
  if (job && hasArrived(job, receivers)) {
    setJob(null);
    setArrival({ id: job.id });
  }
  useArrival(arrival, onArrived);

  const gaveUp = useCallback(
    (id: DeviceId) => {
      setJob(null);
      onGaveUp(id);
    },
    [onGaveUp],
  );
  useGiveUp(job, options.giveUpMs ?? GIVE_UP_MS, gaveUp);
  const everyMs = options.everyMs ?? EVERY_MS;
  const passes = useMemo(() => ({ reach, everyMs, onRefused: gaveUp }), [reach, everyMs, gaveUp]);
  const needsPower = usePasses(job, passes);

  const wake = useCallback(
    async (receiverId: DeviceId, play?: Play) => {
      setJob(await stepsFor(client, receiverId, play));
    },
    [client],
  );

  return { waking: job?.id ?? null, needsPower, wake };
}
