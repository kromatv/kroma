// @vitest-environment jsdom

import { fireEvent, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useCommandKeys } from './command-keys';

// The browser half is loaded by every prerender of a page carrying the palette,
// and a prerender has no document to listen on.
vi.mock('#ui/lib/dom', () => ({ webDocument: () => null, webWindow: () => null }));

describe('useCommandKeys with no document', () => {
  it('binds nothing, and leaves the keys to whoever else wants them', () => {
    const onStep = vi.fn();
    const onChoose = vi.fn();
    const onClose = vi.fn();
    renderHook(() => useCommandKeys({ onStep, onChoose, onClose }));
    expect(fireEvent.keyDown(document, { key: 'ArrowDown' })).toBe(true);
    expect(fireEvent.keyDown(document, { key: 'Escape' })).toBe(true);
    expect(onStep).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});
