// @vitest-environment jsdom

import { I18nProvider } from '@kromatv/ui';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ClientOutdatedScreen } from '#tv/app/client-outdated-screen';
import { type Connection, ConnectionProvider } from '#tv/app/providers/connection';
import { EnvProvider } from '#tv/app/providers/env';

afterEach(cleanup);

function mount(serverVersion: string | null) {
  const connection = { serverVersion, compat: 'client-outdated' } as Connection;
  render(
    <EnvProvider platform="TV">
      <I18nProvider locale="en">
        <ConnectionProvider value={connection}>
          <ClientOutdatedScreen />
        </ConnectionProvider>
      </I18nProvider>
    </EnvProvider>,
  );
}

describe('ClientOutdatedScreen', () => {
  it('says the app is too old for the server it reached, and names the server', () => {
    mount('0.1.40');

    expect(screen.getByText('This app needs an update')).toBeTruthy();
    expect(screen.getByText(/server 0\.1\.40/)).toBeTruthy();
  });

  it('says how a television gets the update', () => {
    mount('0.1.40');

    expect(screen.getByText(/app store/)).toBeTruthy();
  });
});
