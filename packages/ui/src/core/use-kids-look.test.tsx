// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { KitProvider } from '#ui/configure';
import { useStyleRuntime } from './style-context';
import type { StyleRuntime } from './style-runtime';
import { KROMA } from './theme';
import { KROMA_KIDS, KROMA_KIDS_LIGHT } from './theme-kids';
import { useKidsLook } from './use-kids-look.hook';

afterEach(cleanup);

const held: { runtime?: StyleRuntime } = {};

function Wearer({ kids }: Readonly<{ kids: boolean }>) {
  const runtime = useStyleRuntime();
  useEffect(() => {
    held.runtime = runtime;
  }, [runtime]);
  useKidsLook({ kids });
  return null;
}

function page({ kids }: Readonly<{ kids: boolean }>) {
  return (
    <KitProvider config={{}}>
      <Wearer kids={kids} />
    </KitProvider>
  );
}

describe('the Kids look', () => {
  it('dresses a Kids session in the Kids theme, on both grounds', () => {
    const { rerender } = render(page({ kids: false }));
    const applyTheme = vi.spyOn(held.runtime?.theme ?? { applyTheme: () => {} }, 'applyTheme');

    rerender(page({ kids: true }));

    expect(applyTheme).toHaveBeenCalledWith(KROMA_KIDS, KROMA_KIDS_LIGHT);
  });

  it('gives KROMA its theme back once the Kids session leaves', () => {
    const { rerender } = render(page({ kids: true }));
    const applyTheme = vi.spyOn(held.runtime?.theme ?? { applyTheme: () => {} }, 'applyTheme');

    rerender(page({ kids: false }));

    expect(applyTheme).toHaveBeenLastCalledWith(KROMA);
  });

  it('leaves any other session alone', () => {
    const { rerender } = render(page({ kids: false }));
    const applyTheme = vi.spyOn(held.runtime?.theme ?? { applyTheme: () => {} }, 'applyTheme');

    rerender(page({ kids: false }));

    expect(applyTheme).not.toHaveBeenCalled();
  });
});
