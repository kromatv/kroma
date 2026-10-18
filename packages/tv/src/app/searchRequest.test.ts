// Siri launches a cold app to handle a request, so a query routinely exists
// before anything is listening for it.

import { describe, expect, it, vi } from 'vitest';
import { createSearchRequests } from '#tv/app/searchRequest';

describe('searchRequest', () => {
  it('has nothing pending until something is asked for', () => {
    const requests = createSearchRequests();
    expect(requests.takePendingSearch()).toBeNull();
  });

  it('keeps a request made before anyone listens, and replays it to the first listener', () => {
    const requests = createSearchRequests();
    requests.requestSearch('blade runner');
    const heard = vi.fn();
    requests.onSearchRequest(heard)();
    expect(heard).toHaveBeenCalledWith('blade runner');
  });

  it('hands the query to a listener that is already there', () => {
    const requests = createSearchRequests();
    const heard = vi.fn();
    const stop = requests.onSearchRequest(heard);
    requests.requestSearch('dune');
    stop();
    expect(heard).toHaveBeenCalledWith('dune');
  });

  it('still leaves the query readable after delivering it: the screen mounts later', () => {
    const requests = createSearchRequests();
    const stop = requests.onSearchRequest(() => {});
    requests.requestSearch('arrival');
    stop();
    expect(requests.takePendingSearch()).toBe('arrival');
  });

  it('yields a query once only, so a later visit does not repeat it', () => {
    const requests = createSearchRequests();
    requests.requestSearch('sicario');
    expect(requests.takePendingSearch()).toBe('sicario');
    expect(requests.takePendingSearch()).toBeNull();
  });

  it('trims what was spoken and ignores an empty request', () => {
    const requests = createSearchRequests();
    requests.requestSearch('  blade runner  ');
    expect(requests.takePendingSearch()).toBe('blade runner');
    const heard = vi.fn();
    const stop = requests.onSearchRequest(heard);
    requests.requestSearch('   ');
    stop();
    expect(heard).not.toHaveBeenCalled();
    expect(requests.takePendingSearch()).toBeNull();
  });

  it('stops delivering once unsubscribed', () => {
    const requests = createSearchRequests();
    const heard = vi.fn();
    requests.onSearchRequest(heard)();
    requests.requestSearch('enemy');
    expect(heard).not.toHaveBeenCalled();
  });
});

it('keeps cold requests and listeners within the owning shell', () => {
  const a = createSearchRequests();
  const b = createSearchRequests();
  const heard = vi.fn();
  b.onSearchRequest(heard);
  a.requestSearch('alien');
  expect(heard).not.toHaveBeenCalled();
  expect(b.takePendingSearch()).toBeNull();
  expect(a.takePendingSearch()).toBe('alien');
});
