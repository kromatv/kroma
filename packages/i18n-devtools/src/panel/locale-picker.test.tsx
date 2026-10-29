// @vitest-environment jsdom

import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setEngine } from '../engine/engine';
import { testEngine } from '../testing';
import { LocalePicker } from './locale-picker';

afterEach(() => {
  cleanup();
  setEngine(null);
});

describe('the locale picker', () => {
  it('explains why language switching is unavailable instead of offering an empty selector', () => {
    render(<LocalePicker locale="" onLocale={vi.fn()} />);

    expect(screen.getByText('No languages connected. Text inspection is available.')).toBeDefined();
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('shows the active language when a provider registers after the panel opens', () => {
    let codes: readonly string[] = [];
    let announce = () => {};
    setEngine(
      testEngine({
        locales: () => codes,
        activeLocale: () => (codes.length ? 'fr' : ''),
        subscribe: (listener) => {
          announce = listener;
          return () => {};
        },
      }),
    );
    render(<LocalePicker locale="" onLocale={vi.fn()} />);

    act(() => {
      codes = ['fr', 'en'];
      announce();
    });

    expect(screen.queryByText('No languages connected. Text inspection is available.')).toBeNull();
    expect(screen.getByText('French')).toBeDefined();
  });
});
