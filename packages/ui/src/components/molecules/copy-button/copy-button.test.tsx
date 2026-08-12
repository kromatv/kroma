// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CopyButton } from './copy-button';

beforeEach(() => {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
});

afterEach(cleanup);

describe('CopyButton', () => {
  it('confirms on the control itself, in words as well as in its glyph', async () => {
    render(<CopyButton value="kroma.local" iconOnly label="Copier" copiedLabel="Copié" />);
    fireEvent.click(screen.getByLabelText('Copier'));
    expect(await screen.findByLabelText('Copié')).toBeTruthy();
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('kroma.local');
  });
});
