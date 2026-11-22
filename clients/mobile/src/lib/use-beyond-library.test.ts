// @vitest-environment jsdom

import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useBeyondLibrary } from './use-beyond-library.hook';

interface Asked {
  kids: boolean;
  asked: { enabled?: boolean; placeholderData?: (previous: string) => string }[];
}

const app: Asked = vi.hoisted(() => ({ kids: false, asked: [] }));

vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: Asked['asked'][number]) => {
    app.asked.push(options);
    return { data: undefined };
  },
}));
vi.mock('#mobile/lib/session', () => ({
  useClient: () => ({ query: { discovery: { search: (q: string) => ({ queryKey: [q] }) } } }),
  useSession: () => ({ user: { kids: app.kids } }),
}));

afterEach(() => {
  app.kids = false;
  app.asked = [];
});

describe('what the provider holds beyond the library', () => {
  it('is asked once the query has two letters', () => {
    renderHook(() => useBeyondLibrary('du'));

    expect(app.asked.at(-1)?.enabled).toBe(true);
  });

  it('is never asked for a Kids session, which never sees a title the server does not hold', () => {
    app.kids = true;

    renderHook(() => useBeyondLibrary('dune'));

    expect(app.asked.at(-1)?.enabled).toBe(false);
  });

  it('keeps the last answer on screen while the next one is asked', () => {
    renderHook(() => useBeyondLibrary('dune'));

    expect(app.asked.at(-1)?.placeholderData?.('the last answer')).toBe('the last answer');
  });
});
