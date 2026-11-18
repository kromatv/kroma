// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { watchSizes } from './size-watch.web';

describe('watchSizes', () => {
  it('uses the engine ResizeObserver when there is one', () => {
    const observe = vi.fn();
    class Observer {
      observe = observe;
      unobserve = vi.fn();
      disconnect = vi.fn();
    }
    const target = document.createElement('div');

    watchSizes(() => {}, Observer).observe(target);

    expect(observe).toHaveBeenCalledWith(target);
  });

  it('hears the window resize on an engine without ResizeObserver', () => {
    const onResize = vi.fn();
    const sizes = watchSizes(onResize, undefined);
    sizes.observe(document.createElement('canvas'));

    window.dispatchEvent(new Event('resize'));

    expect(onResize).toHaveBeenCalledOnce();
  });

  it('stops hearing the window once disconnected', () => {
    const onResize = vi.fn();
    const sizes = watchSizes(onResize, undefined);

    sizes.disconnect();
    window.dispatchEvent(new Event('resize'));

    expect(onResize).not.toHaveBeenCalled();
  });
});
