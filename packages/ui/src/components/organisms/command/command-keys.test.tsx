// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { onScreen } from '#ui/testing';
import { CommandKeys } from './command-keys';

function on(userAgent: string) {
  vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue(userAgent);
  return render(onScreen(<CommandKeys />)).container;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('CommandKeys', () => {
  it('draws the Command symbol on a Mac', () => {
    const container = on('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)');

    expect(container.querySelectorAll('svg')).toHaveLength(1);
    expect(screen.getByText('K')).toBeTruthy();
  });

  it('spells Ctrl out on Windows', () => {
    const container = on('Mozilla/5.0 (Windows NT 10.0; Win64; x64)');

    expect(container.querySelectorAll('svg')).toHaveLength(0);
    expect(screen.getByText('Ctrl')).toBeTruthy();
  });

  it('spells Ctrl out on Linux', () => {
    on('Mozilla/5.0 (X11; Linux x86_64)');

    expect(screen.getByText('Ctrl')).toBeTruthy();
  });

  it('gives each key its own cap', () => {
    on('Mozilla/5.0 (X11; Linux x86_64)');

    expect(screen.getByText('Ctrl')).not.toBe(screen.getByText('K'));
  });
});
