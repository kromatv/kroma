// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { KidsLook } from './kids-look.component';

const mocks = vi.hoisted(() => ({ kids: false, applyTheme: vi.fn() }));
vi.mock('@kromatv/ui/kit', () => ({
  KROMA: 'kroma',
  KROMA_KIDS: 'kids',
  KROMA_KIDS_LIGHT: 'kids-light',
  useThemeControls: () => ({ applyTheme: mocks.applyTheme }),
}));
vi.mock('#web/shared/lib/use-kids-session.hook', () => ({ useKidsSession: () => mocks.kids }));

afterEach(() => {
  cleanup();
  mocks.kids = false;
  mocks.applyTheme.mockReset();
});

describe('the Kids look', () => {
  it('paints a Kids session in the Kids theme, on both grounds', () => {
    mocks.kids = true;

    render(<KidsLook />);

    expect(mocks.applyTheme).toHaveBeenCalledWith('kids', 'kids-light');
  });

  it('gives KROMA its own theme back once the Kids session leaves', () => {
    mocks.kids = true;
    const { rerender } = render(<KidsLook />);

    mocks.kids = false;
    rerender(<KidsLook />);

    expect(mocks.applyTheme).toHaveBeenLastCalledWith('kroma');
  });

  it('leaves any other session alone', () => {
    render(<KidsLook />);

    expect(mocks.applyTheme).not.toHaveBeenCalled();
  });
});
