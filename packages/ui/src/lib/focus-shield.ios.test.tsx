// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({ available: false, view: vi.fn(() => 'native-focus-shield') }));
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

describe('iOS focus shield', () => {
  it('renders its plain fallback when the TV native module is absent on iPhone', async () => {
    const { FocusShield } = await import('./focus-shield.ios');
    expect(FocusShield).toBeTypeOf('function');
    render(
      <FocusShield shielded>
        <span>Phone sheet contents</span>
      </FocusShield>,
    );
    expect(screen.getByText('Phone sheet contents')).toBeTruthy();
    expect(native.view).not.toHaveBeenCalled();
  });

  it('uses the native shield on builds that include the TV module', async () => {
    native.available = true;
    const { FocusShield } = await import('./focus-shield.ios');
    expect(FocusShield).toBe('native-focus-shield');
    expect(native.view).toHaveBeenCalledWith('FocusShield');
  });
});
