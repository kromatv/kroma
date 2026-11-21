import { Import } from '@kromatv/client/imports';
import { describe, expect, it } from 'vitest';
import { keptSignIns } from './kept-sign-ins';

const KEPT = crypto.randomUUID();

function importOf(server: { id: string; name?: string }, signIn?: string) {
  return Import.parse({
    id: crypto.randomUUID(),
    importer: 'tv.test.plex',
    server,
    ...(signIn ? { signIn } : {}),
    status: 'completed',
    createdAt: 1,
    report: { libraries: {}, users: {}, titles: {}, states: {}, plays: {} },
    unmatchedTitles: 0,
  });
}

describe('the sign-ins the imports keep', () => {
  it('lists a sign-in two imports share once', () => {
    const rows = keptSignIns([
      importOf({ id: 'den', name: 'The den' }, KEPT),
      importOf({ id: 'den', name: 'The den' }, KEPT),
    ]);

    expect(rows).toEqual([{ importer: 'tv.test.plex', signIn: KEPT, server: 'The den' }]);
  });

  it('leaves out an import whose sign-in was forgotten', () => {
    expect(keptSignIns([importOf({ id: 'den', name: 'The den' })])).toEqual([]);
  });

  it('names a server that gave no name by its id', () => {
    expect(keptSignIns([importOf({ id: 'den' }, KEPT)])[0]?.server).toBe('den');
  });
});
