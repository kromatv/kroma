// @vitest-environment jsdom

import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { KROMA_LOCKUP } from '#ui/lib/lockup-paths';
import { onScreen } from '#ui/testing';
import { createStyleTestHost } from '#ui/testing-style';
import { Logo } from './logo.component';

const WORDMARK_UNITS =
  KROMA_LOCKUP.krWidth +
  KROMA_LOCKUP.gapLeft +
  KROMA_LOCKUP.height +
  KROMA_LOCKUP.gapRight +
  KROMA_LOCKUP.maWidth;

const { render } = createStyleTestHost();

afterEach(() => {
  cleanup();
});

describe('Logo', () => {
  it('names KROMA to a reader who cannot see it', () => {
    render(onScreen(<Logo />));

    expect(screen.getByLabelText('KROMA').getAttribute('role')).toBe('img');
    expect(screen.queryByText('Kids')).toBeNull();
  });

  it('draws and names the Kids lockup, its word untranslated', () => {
    render(onScreen(<Logo kids />));

    expect(screen.getByLabelText('KROMA Kids').getAttribute('role')).toBe('img');
    expect(screen.getByText('Kids')).toBeTruthy();
  });

  it('stacks the Kids tag under the wordmark, no wider than KROMA alone', () => {
    render(onScreen(<Logo kids size={24} />));

    const lockup = getComputedStyle(screen.getByLabelText('KROMA Kids'));

    expect(lockup.flexDirection).toBe('column');
    expect(lockup.alignItems).toBe('flex-end');
    expect(parseFloat(lockup.width)).toBeCloseTo((WORDMARK_UNITS * 24) / KROMA_LOCKUP.height, 1);
  });

  it('keeps the plain lockup on one line', () => {
    render(onScreen(<Logo size={24} />));

    expect(getComputedStyle(screen.getByLabelText('KROMA')).flexDirection).toBe('row');
  });

  it('keeps the wheel alone when only the mark is asked for', () => {
    render(onScreen(<Logo kids markOnly />));

    expect(screen.queryByText('Kids')).toBeNull();
  });
});
