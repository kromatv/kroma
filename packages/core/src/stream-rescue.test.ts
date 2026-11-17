import { describe, expect, it, vi } from 'vitest';
import { rescueRoute, restartBudget, routeHttpStatus } from './stream-rescue';

function rescue() {
  return { restart: vi.fn(), renew: vi.fn(), broken: vi.fn() };
}

function failureRoute() {
  return { onGiveUp: vi.fn(), onRefused: vi.fn() };
}

describe('routeHttpStatus', () => {
  it('hands a refusal on as one', () => {
    const to = failureRoute();

    routeHttpStatus(410, to);

    expect(to.onRefused).toHaveBeenCalledWith(410);
    expect(to.onGiveUp).not.toHaveBeenCalled();
  });

  it('gives up on a status that refuses nothing', () => {
    const to = failureRoute();

    routeHttpStatus(503, to);

    expect(to.onGiveUp).toHaveBeenCalledTimes(1);
    expect(to.onRefused).not.toHaveBeenCalled();
  });
});

describe('rescueRoute', () => {
  it('rebuilds a stream the server no longer holds', () => {
    const to = rescue();
    const route = rescueRoute(restartBudget(), to);

    route.onRefused(404);

    expect(to.restart).toHaveBeenCalledTimes(1);
    expect(to.renew).not.toHaveBeenCalled();
  });

  it('renews a credential the server refused instead of rebuilding', () => {
    const to = rescue();
    const route = rescueRoute(restartBudget(), to);

    route.onRefused(403);

    expect(to.renew).toHaveBeenCalledWith(403);
    expect(to.restart).not.toHaveBeenCalled();
  });

  it('leaves a status that refuses nothing alone', () => {
    const to = rescue();
    const route = rescueRoute(restartBudget(), to);

    route.onRefused(502);

    expect(to.restart).not.toHaveBeenCalled();
    expect(to.renew).not.toHaveBeenCalled();
    expect(to.broken).not.toHaveBeenCalled();
  });

  it('calls a stream broken once two rebuilds have not got it playing', () => {
    const to = rescue();
    const route = rescueRoute(restartBudget(), to);

    route.onRefused(404);
    route.onGiveUp();
    route.onGiveUp();

    expect(to.restart).toHaveBeenCalledTimes(2);
    expect(to.broken).toHaveBeenCalledTimes(1);
  });

  it('owes two rebuilds again once the picture plays', () => {
    const to = rescue();
    const budget = restartBudget();
    const route = rescueRoute(budget, to);
    route.onGiveUp();
    route.onGiveUp();

    budget.refill();
    route.onGiveUp();
    route.onGiveUp();

    expect(to.restart).toHaveBeenCalledTimes(4);
    expect(to.broken).not.toHaveBeenCalled();
  });

  it('keeps counting across routes that share a budget', () => {
    const to = rescue();
    const budget = restartBudget();
    rescueRoute(budget, to).onGiveUp();
    rescueRoute(budget, to).onGiveUp();

    rescueRoute(budget, to).onGiveUp();

    expect(to.broken).toHaveBeenCalledTimes(1);
  });
});
