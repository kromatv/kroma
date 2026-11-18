// @vitest-environment jsdom

import { I18nProvider } from '@kromatv/ui';
import { KitProvider, PRESS_GUARD_MS } from '@kromatv/ui/kit';
import { wearsRing } from '@kromatv/ui/testing';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CrashScreen } from '#tv/app/crash-screen.component';
import { EnvProvider } from '#tv/app/providers/env';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function mount(onBack?: () => void) {
  const onRetry = vi.fn();
  vi.useFakeTimers({ toFake: ['Date'] });
  render(
    <KitProvider config={{ remote: true }}>
      <EnvProvider platform="TV">
        <I18nProvider locale="en">
          <CrashScreen onRetry={onRetry} onBack={onBack} />
        </I18nProvider>
      </EnvProvider>
    </KitProvider>,
  );
  vi.advanceTimersByTime(PRESS_GUARD_MS);
  return { onRetry };
}

function remoteBack() {
  const event = new KeyboardEvent('keydown', { cancelable: true, bubbles: true });
  Object.defineProperty(event, 'key', { value: undefined });
  Object.defineProperty(event, 'keyCode', { value: 10009 });
  window.dispatchEvent(event);
}

async function press(key: string) {
  await act(async () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  });
}

describe('CrashScreen', () => {
  it('shows the localized crash message', () => {
    mount();
    expect(screen.getByText('Something went wrong')).toBeTruthy();
  });

  it('offers the way out rather than only describing it', () => {
    const onBack = vi.fn();
    const { onRetry } = mount(onBack);

    fireEvent.click(screen.getByText('Try again'));
    expect(onRetry).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByText('Back'));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('drops Back where there is nowhere to go', () => {
    mount();
    expect(screen.queryByText('Back')).toBeNull();
  });

  it("leaves on the remote's Back", () => {
    const onBack = vi.fn();
    mount(onBack);

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(onBack).toHaveBeenCalledOnce();
  });

  it("leaves on a Samsung remote's Back, which carries only a keyCode", () => {
    const onBack = vi.fn();
    mount(onBack);

    remoteBack();

    expect(onBack).toHaveBeenCalledOnce();
  });

  it('walks from Try again to Back with Right', async () => {
    mount(vi.fn());

    await press('ArrowRight');

    expect(wearsRing(screen.getByLabelText('Back'))).toBe(true);
  });
});
