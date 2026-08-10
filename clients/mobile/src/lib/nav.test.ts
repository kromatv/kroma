import { describe, expect, it, vi } from 'vitest';
import { goBack } from './nav';

const router = (canGoBack: boolean) => ({
  canGoBack: () => canGoBack,
  back: vi.fn(),
  replace: vi.fn(),
});

describe('goBack', () => {
  it('pops the stack when there is something to pop', () => {
    const r = router(true);
    goBack(r as never);
    expect(r.back).toHaveBeenCalled();
    expect(r.replace).not.toHaveBeenCalled();
  });

  it('lands on Home when the screen was the first one', () => {
    const r = router(false);
    goBack(r as never);
    expect(r.replace).toHaveBeenCalledWith('/');
    expect(r.back).not.toHaveBeenCalled();
  });
});
