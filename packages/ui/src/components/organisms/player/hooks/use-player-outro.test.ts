// @vitest-environment jsdom

import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { usePlayerOutro } from './use-player-outro';

type Opts = Parameters<typeof usePlayerOutro>[0];

function base(over: Partial<Opts> = {}): Opts {
  return {
    endedNonce: 0,
    hasNext: false,
    canOffer: true,
    onOffer: vi.fn(),
    onLeave: vi.fn(),
    ...over,
  };
}

describe('usePlayerOutro', () => {
  it('does nothing while the film is still running', () => {
    const opts = base();
    renderHook(() => usePlayerOutro(opts));

    expect(opts.onOffer).not.toHaveBeenCalled();
    expect(opts.onLeave).not.toHaveBeenCalled();
  });

  it('offers the next film when the film ends with one to offer', () => {
    const onOffer = vi.fn();
    const onLeave = vi.fn();
    const { rerender } = renderHook((opts: Opts) => usePlayerOutro(opts), {
      initialProps: base({ onOffer, onLeave }),
    });

    rerender(base({ endedNonce: 1, onOffer, onLeave }));

    expect(onOffer).toHaveBeenCalledTimes(1);
    expect(onLeave).not.toHaveBeenCalled();
  });

  it('leaves the player when the film ends with nothing to offer', () => {
    const onOffer = vi.fn();
    const onLeave = vi.fn();
    const { rerender } = renderHook((opts: Opts) => usePlayerOutro(opts), {
      initialProps: base({ canOffer: false, onOffer, onLeave }),
    });

    rerender(base({ endedNonce: 1, canOffer: false, onOffer, onLeave }));

    expect(onLeave).toHaveBeenCalledTimes(1);
    expect(onOffer).not.toHaveBeenCalled();
  });

  it('stands aside for the credits countdown when an episode is queued', () => {
    const onOffer = vi.fn();
    const onLeave = vi.fn();
    const { rerender } = renderHook((opts: Opts) => usePlayerOutro(opts), {
      initialProps: base({ hasNext: true, onOffer, onLeave }),
    });

    rerender(base({ endedNonce: 1, hasNext: true, onOffer, onLeave }));

    expect(onOffer).not.toHaveBeenCalled();
    expect(onLeave).not.toHaveBeenCalled();
  });

  it('fires once per end, so a re-render does not offer twice', () => {
    const onOffer = vi.fn();
    const { rerender } = renderHook((opts: Opts) => usePlayerOutro(opts), {
      initialProps: base({ onOffer }),
    });

    rerender(base({ endedNonce: 1, onOffer }));
    rerender(base({ endedNonce: 1, onOffer }));

    expect(onOffer).toHaveBeenCalledTimes(1);
  });

  it('ignores a nonce inherited from the title that came before', () => {
    const onOffer = vi.fn();
    const onLeave = vi.fn();
    renderHook((opts: Opts) => usePlayerOutro(opts), {
      initialProps: base({ endedNonce: 3, onOffer, onLeave }),
    });

    expect(onOffer).not.toHaveBeenCalled();
    expect(onLeave).not.toHaveBeenCalled();
  });
});
