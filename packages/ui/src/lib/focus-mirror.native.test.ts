import { describe, expect, it, vi } from 'vitest';
import { isMirrored, mirrorFocus } from './focus-mirror';

describe('focus-mirror (native)', () => {
  it('moves no focus, since the platform focus engine owns it', () => {
    const view = { focus: vi.fn() };

    mirrorFocus(view);

    expect(view.focus).not.toHaveBeenCalled();
  });

  it('never reports a control as holding a focus it was handed', () => {
    const view = {};

    mirrorFocus(view);

    expect(isMirrored(view)).toBe(false);
  });
});
