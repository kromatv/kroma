// @vitest-environment jsdom
import { cleanup } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { measure } from './react';
import { formatResult } from './report';

afterEach(cleanup);

function Leaf({ label }: Readonly<{ label: string }>) {
  return <span>{label}</span>;
}

// A press that adds something. A menu opening is not churn, however many fibers
// it mounts.
function Grows() {
  const [rows, setRows] = useState(1);
  return (
    <>
      <button type="button" onClick={() => setRows(rows + 1)}>
        add
      </button>
      {Array.from({ length: rows }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: the index IS the row's identity here.
        <Leaf key={i} label={`row ${i}`} />
      ))}
    </>
  );
}

// A press that rebuilds what was already there: the key moves with the state, so
// React throws every row away and builds it again.
function Churns() {
  const [n, setN] = useState(0);
  return (
    <>
      <button type="button" onClick={() => setN(n + 1)}>
        bump
      </button>
      {['a', 'b', 'c'].map((id) => (
        <Leaf key={`${id}-${n}`} label={id} />
      ))}
    </>
  );
}

function Static() {
  return <span>nothing to press</span>;
}

function Nothing() {
  return null;
}

describe('measure', () => {
  it('says nothing churned when a press adds something', () => {
    expect(measure(<Grows />).churn).toEqual([]);
  });

  it('names what a press destroyed and built again', () => {
    expect(measure(<Churns />).churn).toContainEqual(['Leaf', 3]);
  });

  it('counts fibers that ran again rather than fibers that appeared', () => {
    expect(measure(<Grows />).rerenders).toBeGreaterThan(0);
  });

  it('reports the components that did the work, worst first', () => {
    expect(measure(<Churns />).components.map(([name]) => name)).toContain('Leaf');
  });

  it('drove nothing when the view has no control, which is not a finding', () => {
    const result = measure(<Static />);

    expect(result.drove).toBeNull();
    expect(result.churn).toEqual([]);
  });

  it('presses the element it is handed', () => {
    const first = measure(<Grows />);
    const again = measure(<Grows />, { press: 'button' });

    expect(again.drove?.tagName).toBe('BUTTON');
    expect(first.drove?.tagName).toBe('BUTTON');
  });
});

describe('elements', () => {
  it('counts what the platform actually draws, not the components above it', () => {
    const result = measure(<Grows />);

    // One button, one span at mount, a second span after the press.
    expect(result.elements).toEqual([
      ['span', 2],
      ['button', 1],
    ]);
    expect(result.elementCount).toBe(3);
  });

  it('is empty for a tree that draws nothing', () => {
    expect(measure(<Nothing />).elementCount).toBe(0);
  });
});

describe('formatResult', () => {
  it('leads with the three numbers, then names the churn', () => {
    const lines = formatResult(measure(<Churns />)).split('\n');

    expect(lines[0]).toMatch(/commits {2}\d+ elements {2}\d+ churned {2}\d+ re-rendered/);
    expect(lines).toContain('destroyed and rebuilt:');
  });
});
