import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createWebTestRuntime } from '#web/shared/lib/web-runtime.fixture';

const H = vi.hoisted(() => ({ authed: true }));
vi.mock('#web/shared/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('#web/shared/lib/api')>()),
  isAuthed: () => H.authed,
}));

vi.mock('#web/features/catalog/sidebar', () => ({ Sidebar: () => null, MobileTopbar: () => null }));

import { Route } from './_app';

const fetched = vi.fn(async () => Response.json({ unread: 0, items: [] }));

async function load() {
  const runtime = createWebTestRuntime({});
  const loader = Route.options.loader;
  if (typeof loader !== 'function') throw new Error('the app layout loads with a function');
  await loader({ context: { runtime, queryClient: runtime.queryClient } } as never);
}

const requestedPaths = () =>
  fetched.mock.calls.map(([input]: unknown[]) => new URL(String(input)).pathname);

beforeEach(() => {
  H.authed = true;
  vi.stubGlobal('fetch', fetched);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it('starts the notification bell beside the page rather than after it', async () => {
  await load();

  expect(requestedPaths()).toContain('/api/notifications');
});

it('asks for nothing before an account is signed in', async () => {
  H.authed = false;

  await load();

  expect(fetched).not.toHaveBeenCalled();
});
