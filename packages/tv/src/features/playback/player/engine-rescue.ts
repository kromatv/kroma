import {
  type FailureRoute,
  playerErrorStatus,
  type RestartBudget,
  rescueRoute,
  restartBudget,
  routeHttpStatus,
} from '@kromatv/core';

interface EngineRescueHooks {
  refreshSession: () => Promise<string | undefined>;
  restart: () => void;
  broken: () => void;
  gone: () => boolean;
}

/**
 * A TV engine's `rescueRoute`. A credential the server refused renews the
 * session and then restarts from the same `budget`, or is `broken` when the
 * session cannot be renewed. Nothing reaches an engine that is `gone`.
 */
export function engineRescue(budget: RestartBudget, hooks: EngineRescueHooks): FailureRoute {
  const route = rescueRoute(budget, {
    restart: hooks.restart,
    broken: hooks.broken,
    renew: () => {
      const resume = (token: string | undefined): void => {
        if (hooks.gone()) {
          return;
        }
        if (token) {
          route.onGiveUp();
        } else {
          hooks.broken();
        }
      };
      hooks.refreshSession().then(resume, () => resume(undefined));
    },
  });
  return route;
}

/**
 * The rescue of an anchored master whose player reports its failures as errors.
 * An error naming an HTTP status takes the route that status picks. One naming
 * none is rescued only once the title has played: a title the device never got
 * playing is one it may not be able to open, and that is the engine's fallback
 * to make. The budget is refilled each time the picture plays.
 */
export class MasterRescue {
  private played = false;
  private readonly budget = restartBudget();
  private readonly route: FailureRoute;

  constructor(hooks: EngineRescueHooks) {
    this.route = engineRescue(this.budget, hooks);
  }

  playing(): void {
    this.played = true;
    this.budget.refill();
  }

  /** Answers whether the failure was taken; `false` leaves it to the engine. */
  failed(error: unknown): boolean {
    const status = playerErrorStatus(error);
    if (status !== null) {
      routeHttpStatus(status, this.route);
      return true;
    }
    if (this.played) {
      this.route.onGiveUp();
    }
    return this.played;
  }
}
