import type { Capability } from '@kromatv/client/capabilities';
import { describe, expect, it } from 'vitest';
import { createTranslator } from './i18n';
import { impliedSource, watchAction, watchSource, watchSources } from './watchable-source';

const t = createTranslator('en');

const TORRENTS = {
  mount: '/api/module/tv.kroma.torrents',
  label: 'Torrents',
  icon: 'magnet',
  figures: [{ key: 'speed', label: 'Vitesse', kind: 'rate' as const }],
  actions: [{ key: 'cancel', label: 'Annuler' }],
};

const USENET = { ...TORRENTS, mount: '/api/module/tv.kroma.usenet', label: 'Usenet' };

describe('the ways a server offers to watch', () => {
  it('hands back what the server declared, in the order it declared it', () => {
    const capability: Capability = { mount: TORRENTS.mount, sources: [TORRENTS, USENET] };

    expect(watchSources(capability, t).map((source) => source.label)).toEqual([
      'Torrents',
      'Usenet',
    ]);
  });

  it('reads a capability that declares none as one source on its bare mount', () => {
    const [only, ...rest] = watchSources({ mount: '/api/module/tv.example.old' }, t);

    expect(only?.mount).toBe('/api/module/tv.example.old');
    expect(only?.figures.map((figure) => figure.key)).toEqual(['downloaded', 'speed', 'sources']);
    expect(rest).toEqual([]);
  });

  it('offers nothing where nothing answers the capability', () => {
    expect(watchSources(null, t)).toEqual([]);
  });
});

describe('the source a viewer watches on', () => {
  it('is the only one on offer, with nothing to pick', () => {
    expect(watchSource([TORRENTS], null)?.label).toBe('Torrents');
  });

  it('is nobody until a viewer picks, once several answer', () => {
    expect(watchSource([TORRENTS, USENET], null)).toBeNull();
    expect(watchSource([TORRENTS, USENET], USENET.mount)?.label).toBe('Usenet');
  });

  it('is nobody when the pick names a mount that has since gone', () => {
    expect(watchSource([TORRENTS, USENET], '/api/module/tv.example.gone')).toBeNull();
  });
});

describe('what a source calls an action', () => {
  it('answers with its own word where it declares one', () => {
    expect(watchAction(TORRENTS, 'cancel')).toBe('Annuler');
  });

  it('answers with nothing for an action it never named', () => {
    expect(watchAction(TORRENTS, 'pause')).toBeNull();
    expect(watchAction(impliedSource('/m', t), 'cancel')).toBeNull();
  });
});
