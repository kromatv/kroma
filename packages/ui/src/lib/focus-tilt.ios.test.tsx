// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({ available: false, view: vi.fn(() => 'native-focus-tilt') }));
vi.mock('expo', () => ({
  requireOptionalNativeModule: () => (native.available ? {} : null),
  requireNativeView: native.view,
}));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  native.available = false;
});
afterEach(cleanup);

describe('iOS focus tilt', () => {
  it('renders the poster flat on an iPhone build without the TV module', async () => {
    const { FocusTilt } = await import('./focus-tilt.ios');

    const { container } = render(
      <FocusTilt active>
        <span>Dune</span>
      </FocusTilt>,
    );

    expect(screen.getByText('Dune')).toBeTruthy();
    expect(container.firstElementChild?.tagName).toBe('SPAN');
    expect(native.view).not.toHaveBeenCalled();
  });

  it('uses the native tilt on builds that include the TV module', async () => {
    native.available = true;

    const { FocusTilt } = await import('./focus-tilt.ios');

    expect(FocusTilt).toBe('native-focus-tilt');
    expect(native.view).toHaveBeenCalledWith('FocusTilt');
  });
});
