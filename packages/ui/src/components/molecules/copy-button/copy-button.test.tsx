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

  it('confirms on the labelled face too', async () => {
    render(<CopyButton value="kroma.local" label="Copier" copiedLabel="Copié" />);
    fireEvent.click(screen.getByText('Copier'));
    expect(await screen.findByText('Copié')).toBeTruthy();
  });

  it('says so when the platform refuses the write, rather than looking like a no-op', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error('NotAllowedError')) },
    });
    render(<CopyButton value="kroma.local" label="Copier" failedLabel="Copie impossible" />);
    fireEvent.click(screen.getByText('Copier'));
    expect(await screen.findByText('Copie impossible')).toBeTruthy();
  });

  it('renders nothing at all where the platform has no clipboard', async () => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
    render(<CopyButton value="kroma.local" label="Copier" />);
    await vi.waitFor(() => expect(screen.queryByText('Copier')).toBeNull());
  });
});
