import { streamRefusal } from './playback-stall';

const MAX_RESTARTS = 2;

/** Where an engine sends a stream it cannot carry on with. */
export interface FailureRoute {
  onGiveUp: () => void;
  onRefused: (status: number) => void;
}

/** What a player can do about a stream an engine stopped on. */
export interface StreamRescue {
  restart: () => void;
  renew: (status: number) => void;
  broken: () => void;
}

/** The rebuilds a failing stream has left before the player calls it broken. */
export interface RestartBudget {
  spend: () => boolean;
  refill: () => void;
}

/** Two rebuilds between plays: `spend` answers whether one was left, and
 * `refill` gives both back once the picture plays again. */
export function restartBudget(): RestartBudget {
  let spent = 0;
  return {
    spend: () => {
      spent += 1;
      return spent <= MAX_RESTARTS;
    },
    refill: () => {
      spent = 0;
    },
  };
}

/**
 * A player's answer to an engine that cannot carry on, the same on every client.
 * A stream the server no longer holds, as after a pause long enough for it to
 * reap the session, or one the engine gave up on, is rebuilt at the playhead
 * while `budget` lasts and is `broken` after that. A refusal for the credential
 * goes to `renew`; any other status is not a refusal and changes nothing.
 */
export function rescueRoute(budget: RestartBudget, rescue: StreamRescue): FailureRoute {
  const onGiveUp = (): void => {
    if (budget.spend()) {
      rescue.restart();
    } else {
      rescue.broken();
    }
  };
  return {
    onGiveUp,
    onRefused: (status) => {
      const refusal = streamRefusal(status);
      if (refusal === 'missing') {
        onGiveUp();
      } else if (refusal === 'denied') {
        rescue.renew(status);
      }
    },
  };
}
