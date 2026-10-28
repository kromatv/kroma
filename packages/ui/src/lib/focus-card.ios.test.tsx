// @vitest-environment jsdom

import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({ available: false, view: vi.fn(() => 'native-focus-card') }));
vi.mock('expo', () => ({
  requireOptionalNativeModule: () => (native.available ? {} : null),
  requireNativeView: native.view,
}));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  native.available = false;
});

describe('iOS focus card', () => {
  it('draws nothing where the TV module is absent, as on an iPhone', async () => {
    const { FocusCard } = await import('./focus-card.ios');

    const { container } = render(<FocusCard holdsFocus radius={12} face="child" />);

    expect(container.innerHTML).toBe('');
    expect(native.view).not.toHaveBeenCalled();
  });

  it('uses the native card on builds that include the TV module', async () => {
    native.available = true;

    const { FocusCard } = await import('./focus-card.ios');

    expect(FocusCard).toBe('native-focus-card');
    expect(native.view).toHaveBeenCalledWith('FocusCard');
  });
});
