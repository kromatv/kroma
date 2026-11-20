import type { DeviceId, KromaClient } from '@kromatv/client';
import type { CastCommand, CastReceiver } from '@kromatv/client/cast';
import type { KromaEvents } from '@kromatv/client/events';
import type { WakeReach } from '@kromatv/core';
import { type Dispatch, type RefObject, type SetStateAction, useCallback } from 'react';
import type { Cast, CastFailure } from './cast-context';
import { useCastWake } from './cast-wake.hook';

type Play = Extract<CastCommand, { type: 'play' }>;

interface BringBackOptions {
  client: KromaClient | null;
  receivers: CastReceiver[];
  reach: WakeReach;
  socket: RefObject<KromaEvents | null>;
  name: RefObject<string>;
  setActiveId: Dispatch<SetStateAction<DeviceId | null>>;
  setError: Dispatch<SetStateAction<Cast['error']>>;
  failureOf: (e: unknown) => CastFailure;
}

function useArrival({
  socket,
  name,
  setActiveId,
  setError,
}: Pick<BringBackOptions, 'socket' | 'name' | 'setActiveId' | 'setError'>) {
  const arrived = useCallback(
    (receiverId: DeviceId) => {
      socket.current?.send({ type: 'cast.control', receiverId, name: name.current });
    },
    [socket, name],
  );
  const gaveUp = useCallback(
    (receiverId: DeviceId) => {
      setActiveId((id) => (id === receiverId ? null : id));
      setError('cast.failed');
    },
    [setActiveId, setError],
  );
  return { arrived, gaveUp };
}

/** Bring a television that is off back, take the remote once it is on, and give
 * the selection up if it never comes. `bringBack` answers the failure, or null. */
export function useBringBack(options: BringBackOptions) {
  const { client, receivers, reach, setActiveId, setError, failureOf } = options;
  const { arrived, gaveUp } = useArrival(options);
  const { waking, needsPower, wake } = useCastWake({
    client,
    receivers,
    reach,
    onArrived: arrived,
    onGaveUp: gaveUp,
  });

  const bringBack = useCallback(
    async (receiverId: DeviceId, play?: Play) => {
      try {
        await wake(receiverId, play);
        setActiveId(receiverId);
        setError(null);
        return null;
      } catch (e) {
        const failure = failureOf(e);
        setError(failure);
        return failure;
      }
    },
    [wake, setActiveId, setError, failureOf],
  );

  return { waking, needsPower, bringBack };
}
