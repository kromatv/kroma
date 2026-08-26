// @vitest-environment jsdom

import { I18nProvider } from '@kroma/ui';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CrashScreen } from '#tv/app/CrashScreen';
import { EnvProvider } from '#tv/app/providers/env';

afterEach(cleanup);

function mount(onBack?: () => void) {
  const onRetry = vi.fn();
  render(
    <EnvProvider platform="TV">
      <I18nProvider locale="en">
        <CrashScreen onRetry={onRetry} onBack={onBack} />
      </I18nProvider>
    </EnvProvider>,
  );
  return { onRetry };
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
});
