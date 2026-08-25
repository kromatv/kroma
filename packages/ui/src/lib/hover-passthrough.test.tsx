// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useHoverPassthrough } from './hover-passthrough';

const LOCK = 'react-gui:hover:lock';

function Inner() {
  const passthrough = useHoverPassthrough<HTMLDivElement>();
  return <div ref={passthrough} data-testid="inner" />;
}

// The host a disabled <Focusable> swaps in: a control that mounts guarded and is
// then enabled must still stop the lock, which an effect keyed on a ref object
// could not do.
function Swapping({ guarded }: Readonly<{ guarded: boolean }>) {
  const passthrough = useHoverPassthrough<HTMLDivElement>();
  if (guarded) return <span data-testid="inner" />;
  return <div ref={passthrough} data-testid="inner" />;
}

function Bare() {
  return <div data-testid="inner" />;
}

function lockFromInner(Child: () => React.ReactElement) {
  const seen = vi.fn();
  const { getByTestId, container } = render(
    <div data-testid="outer">
      <Child />
    </div>,
  );
  container.firstElementChild?.addEventListener(LOCK, seen);
  getByTestId('inner').dispatchEvent(new Event(LOCK, { bubbles: true }));
  return seen;
}

describe('useHoverPassthrough', () => {
  it('binds the host it is given after a swap, not the one at first commit', () => {
    const seen = vi.fn();
    const { getByTestId, container, rerender } = render(
      <div data-testid="outer">
        <Swapping guarded />
      </div>,
    );
    container.firstElementChild?.addEventListener(LOCK, seen);

    rerender(
      <div data-testid="outer">
        <Swapping guarded={false} />
      </div>,
    );
    getByTestId('inner').dispatchEvent(new Event(LOCK, { bubbles: true }));

    expect(seen).not.toHaveBeenCalled();
  });

  it("keeps a control's hover lock from reaching its ancestors", () => {
    expect(lockFromInner(Inner)).not.toHaveBeenCalled();
  });

  it('is the lock an unguarded control lets through', () => {
    expect(lockFromInner(Bare)).toHaveBeenCalledTimes(1);
  });
});
