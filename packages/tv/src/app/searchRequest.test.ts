// The door a search comes through from outside the app (Siri on Apple TV).
//
// The timing is the whole point of these: Siri launches a cold app to handle a
// request, so a query routinely exists before anything is listening for it.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { onSearchRequest, requestSearch, takePendingSearch } from '#tv/app/searchRequest';

afterEach(() => {
  takePendingSearch(); // leave no request behind for the next test
});

describe('searchRequest', () => {
  it('has nothing pending until something is asked for', () => {
    expect(takePendingSearch()).toBeNull();
  });

  it('keeps a request made before anyone listens, and replays it to the first listener', () => {
    requestSearch('blade runner');
    const heard = vi.fn();
    onSearchRequest(heard)();
    expect(heard).toHaveBeenCalledWith('blade runner');
  });

  it('hands the query to a listener that is already there', () => {
    const heard = vi.fn();
    const stop = onSearchRequest(heard);
    requestSearch('dune');
    stop();
    expect(heard).toHaveBeenCalledWith('dune');
  });

  it('still leaves the query readable after delivering it: the screen mounts later', () => {
    const stop = onSearchRequest(() => {});
    requestSearch('arrival');
    stop();
    expect(takePendingSearch()).toBe('arrival');
  });

  it('yields a query once only, so a later visit does not repeat it', () => {
    requestSearch('sicario');
    expect(takePendingSearch()).toBe('sicario');
    expect(takePendingSearch()).toBeNull();
  });

  it('trims what was spoken and ignores an empty request', () => {
    requestSearch('  blade runner  ');
    expect(takePendingSearch()).toBe('blade runner');
    const heard = vi.fn();
    const stop = onSearchRequest(heard);
    requestSearch('   ');
    stop();
    expect(heard).not.toHaveBeenCalled();
    expect(takePendingSearch()).toBeNull();
  });

  it('stops delivering once unsubscribed', () => {
    const heard = vi.fn();
    onSearchRequest(heard)();
    requestSearch('enemy');
    expect(heard).not.toHaveBeenCalled();
  });
});
