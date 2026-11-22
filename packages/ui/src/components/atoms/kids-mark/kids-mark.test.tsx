// @vitest-environment jsdom

import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { onScreen } from '#ui/testing';
import { createStyleTestHost } from '#ui/testing-style';
import { KidsMark } from './kids-mark.component';

const { render } = createStyleTestHost();

afterEach(() => {
  cleanup();
});

describe('KidsMark', () => {
  it('names the brand, so a reader who cannot see the wheel still hears it', () => {
    render(onScreen(<KidsMark />));

    expect(screen.getByLabelText('KROMA Kids').getAttribute('role')).toBe('img');
  });

  it('writes the brand word untranslated', () => {
    render(onScreen(<KidsMark size="md" />));

    expect(screen.getByText('Kids')).toBeTruthy();
  });
});
