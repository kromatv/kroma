import { describe, expect, it } from 'vitest';
import { bundledManifest, ENGINE_FLOORS } from './recorded-engines';

const authored = (server: string | null) =>
  JSON.stringify({
    schemaVersion: 3,
    id: 'tv.kroma.notes',
    name: 'Notes',
    version: '1.2.0',
    ...(server ? { engines: { server } } : {}),
  });

const both = { host: '0.2.0', core: '19' };

describe('bundledManifest', () => {
  it('records the interface and the core schema for a module no older server could run', () => {
    const bundled = JSON.parse(bundledManifest(authored(`>=${ENGINE_FLOORS.core}`), both));

    expect(bundled.engines).toEqual({
      server: `>=${ENGINE_FLOORS.core}`,
      host: '0.2.0',
      core: '19',
    });
    expect(bundled.id).toBe('tv.kroma.notes');
  });

  it('leaves a module an older server may run byte for byte, since that server refuses the fields', () => {
    const older = authored('>=0.1.39');

    expect(bundledManifest(older, both)).toBe(older);
  });

  it('leaves a module that sets no server floor as it was written', () => {
    expect(bundledManifest(authored(null), both)).toBe(authored(null));
    expect(bundledManifest(authored('*'), both)).toBe(authored('*'));
  });

  it('leaves a module with nothing to record as it was written', () => {
    const library = authored(`>=${ENGINE_FLOORS.host}`);

    expect(bundledManifest(library, { host: null, core: null })).toBe(library);
  });

  it('records the core schema of a module whose grant reaches the core and whose component imports nothing', () => {
    const bundled = JSON.parse(
      bundledManifest(authored(`>=${ENGINE_FLOORS.core}`), { host: null, core: '19' }),
    );

    expect(bundled.engines).toEqual({ server: `>=${ENGINE_FLOORS.core}`, core: '19' });
  });
});
