import { act, cleanup, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { CompiledParent } from './react-compiler-identity.fixture';

afterEach(cleanup);
it('keeps compiled child props stable through unrelated parent updates', () => {
  const visited = vi.fn();
  function Child({ payload }: { payload: { value: number } }) {
    visited(payload);
    return <span>{payload.value}</span>;
  }
  function Harness() {
    const [tick, setTick] = useState(0);
    return (
      <div>
        <button type="button" onClick={() => setTick(tick + 1)}>
          tick {tick}
        </button>
        <CompiledParent value={7} Child={Child} />
      </div>
    );
  }
  render(<Harness />);
  const first = visited.mock.calls[0]?.[0];
  act(() => screen.getByRole('button').click());
  expect(screen.getByText('tick 1')).toBeTruthy();
  expect(visited.mock.calls.at(-1)?.[0]).toBe(first);
  expect(screen.getByText('7')).toBeTruthy();
});
