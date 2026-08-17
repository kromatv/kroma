// @vitest-environment jsdom

import { I18nProvider } from '@kroma/ui';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { CrashScreen } from '#tv/app/CrashScreen';
import { EnvProvider } from '#tv/app/providers/env';

afterEach(cleanup);

describe('CrashScreen', () => {
  it('shows the localized crash message', () => {
    render(
      <EnvProvider platform="TV">
        <I18nProvider locale="en">
          <CrashScreen />
        </I18nProvider>
      </EnvProvider>,
    );
    expect(screen.getByText('Something went wrong')).toBeTruthy();
  });
});
