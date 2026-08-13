// @vitest-environment jsdom

import { KromaApiError } from '@kroma/core';
import { I18nProvider } from '@kroma/ui';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ModuleFailed } from './page-states';

const wrapper = ({ children }: { children: ReactNode }) => (
  <I18nProvider locale="en">{children}</I18nProvider>
);

const mount = (ui: ReactElement) => render(ui, { wrapper });

const refused = () =>
  new TypeError('fetch failed', {
    cause: Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:4040'), {
      code: 'ECONNREFUSED',
    }),
  });

describe('ModuleFailed', () => {
  it('blames the server, not the module, when the request never got an answer', () => {
    mount(<ModuleFailed error={refused()} />);
    expect(screen.getByText('The server is not responding.')).toBeTruthy();
    expect(screen.queryByText('This page could not be loaded')).toBeNull();
    expect(screen.getByText('fetch failed (ECONNREFUSED)')).toBeTruthy();
  });

  it('reads a dev proxy 502 as the server being down', () => {
    mount(<ModuleFailed error={new KromaApiError(502, 'GET /admin/settings failed (502)')} />);
    expect(screen.getByText('The server is not responding.')).toBeTruthy();
    expect(screen.getByText('Details · HTTP 502')).toBeTruthy();
    expect(screen.getByText('GET /admin/settings failed (502)')).toBeTruthy();
  });

  it('reads a 404 from the module mount as a process that is not running', () => {
    mount(<ModuleFailed error={new KromaApiError(404, 'GET /admin/m/tv.kroma.vpn/state (404)')} />);
    expect(
      screen.getByText('The module is installed but its process is not running.'),
    ).toBeTruthy();
  });

  it('keeps the generic wording for any other status, with the server message', () => {
    const error = new KromaApiError(500, 'GET /admin/m/x/y failed (500)', {
      error: 'no route to the daemon',
    });
    mount(<ModuleFailed error={error} />);
    expect(screen.getByText('This page could not be loaded')).toBeTruthy();
    expect(screen.getByText('Details · HTTP 500')).toBeTruthy();
    expect(screen.getByText('no route to the daemon')).toBeTruthy();
  });

  it('falls back to the generic wording, and shows nothing raw, without a cause', () => {
    mount(<ModuleFailed />);
    expect(screen.getByText('This page could not be loaded')).toBeTruthy();
    expect(screen.getByText('The module is installed; its data did not answer.')).toBeTruthy();
    expect(screen.queryByText('Details')).toBeNull();
  });

  it('still offers the retry', () => {
    const retry = vi.fn();
    mount(<ModuleFailed error={refused()} retry={retry} />);
    fireEvent.click(screen.getByText('Try again'));
    expect(retry).toHaveBeenCalledTimes(1);
  });
});
