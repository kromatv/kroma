// @vitest-environment jsdom
import type { KromaHost, ModuleRoute } from '@kromatv/module-sdk';
import { Text } from '@kromatv/ui/kit';
import { onScreen } from '@kromatv/ui/testing';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

const lookup = vi.hoisted(() => ({
  host: { i18n: { t: (key: string) => key, locale: 'en' } } as unknown as KromaHost | null,
  match: { kind: 'unknown' } as
    | { kind: 'page'; route: ModuleRoute }
    | { kind: 'disabled' }
    | { kind: 'unknown' },
}));

vi.mock('#web/modules/ModuleHostProvider', () => ({
  useModuleHostValue: () => lookup.host,
  useModuleRouteMatch: () => lookup.match,
  useModuleT: () => (key: string) => key,
}));

import { ModuleRouteOutlet } from './ModuleRouteOutlet';

afterEach(cleanup);

function show() {
  render(onScreen(<ModuleRouteOutlet path="torrents" notFound={<Text>the 404 page</Text>} />));
}

it('renders the page of the module that claims the path', () => {
  lookup.match = {
    kind: 'page',
    route: {
      moduleId: 'tv.kroma.torrents',
      path: 'torrents',
      component: () => <Text>the torrents page</Text>,
    },
  };

  show();

  expect(screen.getByText('the torrents page')).toBeTruthy();
});

it('says the module is unavailable when a disabled module claims the path', () => {
  lookup.match = { kind: 'disabled' };

  show();

  expect(screen.getByText('Module unavailable')).toBeTruthy();
  expect(screen.queryByText('the 404 page')).toBeNull();
});

it('hands over to the 404 page when no module claims the path', () => {
  lookup.match = { kind: 'unknown' };

  show();

  expect(screen.getByText('the 404 page')).toBeTruthy();
  expect(screen.queryByText('Module unavailable')).toBeNull();
});
