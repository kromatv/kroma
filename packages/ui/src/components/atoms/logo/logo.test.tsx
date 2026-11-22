// @vitest-environment jsdom

import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { onScreen } from '#ui/testing';
import { createStyleTestHost } from '#ui/testing-style';
import { Logo } from './logo.component';

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

  it('keeps the wheel alone when only the mark is asked for', () => {
    render(onScreen(<Logo kids markOnly />));

    expect(screen.queryByText('Kids')).toBeNull();
  });
});
