// @vitest-environment jsdom
import { cleanup } from '@testing-library/react';
import { type ReactNode, useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { measure } from './react';

afterEach(cleanup);

// The case a small tree cannot show. React only clones the fibers it walks, so
// a subtree it bails out of keeps the `alternate` and the `flags` it was born
// with - for the whole life of the tree. Any reading that takes "no alternate"
// for "mounted this commit" reports every one of these leaves as churn on every
// commit, and the deeper the tree the louder it is.

function Leaf({ label }: Readonly<{ label: string }>) {
  return <span>{label}</span>;
}

function Nest({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div>
      <div>
        <div>{children}</div>
      </div>
    </div>
  );
}

const LABELS = Array.from({ length: 40 }, (_, i) => `leaf ${i}`);
const LEAVES = LABELS.map((label) => <Leaf key={label} label={label} />);

function Bails() {
  const [n, setN] = useState(0);
  return (
    <>
      <button type="button" onClick={() => setN(n + 1)}>
        bump
      </button>
      <span>{n}</span>
      <Nest>{LEAVES}</Nest>
    </>
  );
}

function Rebuilds() {
  const [n, setN] = useState(0);
  return (
    <>
      <button type="button" onClick={() => setN(n + 1)}>
        bump
      </button>
      <Nest>
        {LABELS.map((label) => (
          <Leaf key={`${label}-${n}`} label={label} />
        ))}
      </Nest>
    </>
  );
}

describe('a subtree React bails out of', () => {
  it('is not churn, however many fibers it holds', () => {
    expect(measure(<Bails />).churn).toEqual([]);
  });

  it('did no work in any commit after the mount', () => {
    const after = measure(<Bails />).commits.slice(1);

    expect(after.flatMap((commit) => Object.keys(commit.work))).not.toContain('Leaf');
  });

  it('still reports the fibers above it that did run', () => {
    expect(measure(<Bails />).rerenders).toBeGreaterThan(0);
  });
});

describe('a subtree React really does rebuild', () => {
  it('is named, at the same depth', () => {
    expect(measure(<Rebuilds />).churn).toContainEqual(['Leaf', 40]);
  });
});
