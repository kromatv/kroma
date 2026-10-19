// @vitest-environment jsdom

import { fireEvent, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useListCursorKeys } from './list-cursor-keys';

vi.mock('#ui/lib/dom', () => ({ webDocument: () => null, webWindow: () => null }));

describe('useListCursorKeys with no document', () => {
  it('binds nothing, and leaves the keys to whoever else wants them', () => {
    const onStep = vi.fn();
    const onChoose = vi.fn();
    const onClose = vi.fn();
    renderHook(() => useListCursorKeys({ onStep, onChoose, onClose, cursor: 'a' }));
    expect(fireEvent.keyDown(document, { key: 'ArrowDown' })).toBe(true);
    expect(fireEvent.keyDown(document, { key: 'Escape' })).toBe(true);
    expect(onStep).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});
