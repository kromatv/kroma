// @vitest-environment jsdom

import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { holdStatus, wantStatus } from '../overlay/review';
import { TranslationStatus } from './translation-status';

const STANDING = {
  locale: 'en',
  coverage: 0.978,
  missing: 12,
  outdated: 3,
  unreviewed: 5,
  sets: [],
};

afterEach(() => {
  cleanup();
  wantStatus(null);
});

describe('the translation status', () => {
  it('shows nothing until the dev server has said how the locale stands', () => {
    const { container } = render(<TranslationStatus />);

    expect(container.textContent).toBe('');
  });

  it('shows the share a reader gets and the three counts behind what is left', () => {
    wantStatus('en');
    holdStatus(STANDING);

    render(<TranslationStatus />);

    expect(screen.getByText('Translated (en)')).toBeDefined();
    expect(screen.getByText('97%')).toBeDefined();
    expect(screen.getByText('12 missing')).toBeDefined();
    expect(screen.getByText('3 outdated')).toBeDefined();
    expect(screen.getByText('5 unreviewed')).toBeDefined();
  });

  it('follows the status when a confirm moves it', () => {
    wantStatus('en');
    holdStatus(STANDING);
    render(<TranslationStatus />);

    act(() => holdStatus({ ...STANDING, outdated: 2 }));

    expect(screen.getByText('2 outdated')).toBeDefined();
  });
});
