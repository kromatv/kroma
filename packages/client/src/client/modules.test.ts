import { describe, expect, it } from 'vitest';
import type { RequestContext } from './base';
import { listModules } from './modules';

function ctxAnswering(payload: unknown): RequestContext {
  return { json: async () => payload } as unknown as RequestContext;
}

describe('listModules', () => {
  it('reads a module list with its capabilities and add-form fields', async () => {
    const ctx = ctxAnswering([
      {
        id: 'tv.kroma.torrents',
        name: 'Torrents',
        enabled: true,
        provides: [
          {
            kind: 'download-client',
            id: 'rqbit',
            label: 'rqbit',
            fields: [{ key: 'url', label: 'field.url', type: 'string', default: null }],
          },
        ],
      },
    ]);

    await expect(listModules(ctx)).resolves.toEqual([
      {
        id: 'tv.kroma.torrents',
        name: 'Torrents',
        enabled: true,
        provides: [
          {
            kind: 'download-client',
            id: 'rqbit',
            label: 'rqbit',
            fields: [{ key: 'url', label: 'field.url', type: 'string' }],
          },
        ],
      },
    ]);
  });

  it('renders a field kind this build does not know as a text field', async () => {
    const ctx = ctxAnswering([
      {
        id: 'tv.kroma.notes',
        name: 'Notes',
        provides: [
          { kind: 'indexer-engine', id: 'x', fields: [{ key: 'k', label: 'l', type: 'textarea' }] },
        ],
      },
    ]);

    const [mod] = await listModules(ctx);

    expect(mod?.provides?.[0]?.fields?.[0]?.type).toBe('string');
  });

  it('drops a module whose manifest the schema rejects and keeps the rest', async () => {
    const ctx = ctxAnswering([{ id: 'tv.kroma.notes' }, { id: 'tv.kroma.scene', name: 'Scene' }]);

    await expect(listModules(ctx)).resolves.toEqual([{ id: 'tv.kroma.scene', name: 'Scene' }]);
  });

  it('rejects a body that is not a list', async () => {
    await expect(listModules(ctxAnswering({ modules: [] }))).rejects.toThrow();
  });
});
