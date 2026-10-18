import { describe, expect, it, vi } from 'vitest';
import { createFocusServices } from './focus-services';

describe('native remote transport ownership', () => {
  it('deduplicates transports within a host without choosing another host’s transport', () => {
    const first = createFocusServices(true);
    const second = createFocusServices(true);
    const a = vi.fn();
    const b = vi.fn();
    first.remote.subscribe(a);
    second.remote.subscribe(b);
    first.remote.stepRing('down', 'events');
    first.remote.stepRing('down', 'host');
    second.remote.stepRing('up', 'host');
    expect(a).toHaveBeenCalledExactlyOnceWith('down');
    expect(b).toHaveBeenCalledExactlyOnceWith('up');
  });
});
