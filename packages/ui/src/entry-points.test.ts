// `Player` is deliberately left out of components/organisms/index.ts: adding it
// makes both entry points export the same symbol, which is a duplicate-identifier
// build error for a consumer importing from both and a doubled bundle otherwise.

import { describe, expect, it } from 'vitest';
import * as services from './index';
import * as kit from './kit';

const names = (module: Record<string, unknown>) => Object.keys(module).sort();

describe('the kit', () => {
  it('imports at all', () => {
    expect(names(kit).length).toBeGreaterThan(0);
  });

  it('re-exports the four atomic levels FLAT', () => {
    for (const name of ['Button', 'Text', 'Icon', 'ListRow', 'Rail', 'TvStage']) {
      expect(names(kit)).toContain(name);
    }
  });

  it('carries the cross-platform escape hatches and the tokens', () => {
    for (const name of ['gradient', 'backdropBlur', 'promote', 'boxStyle', 'sv']) {
      expect(names(kit)).toContain(name);
    }
  });

  it('exposes no default export', () => {
    expect(names(kit)).not.toContain('default');
  });
});

describe('the services', () => {
  it('imports at all', () => {
    expect(names(services).length).toBeGreaterThan(0);
  });

  it('carries the hooks and providers that know the server', () => {
    for (const name of ['useAuthSession', 'useT', 'I18nProvider', 'usePlaybackHeartbeat']) {
      expect(names(services)).toContain(name);
    }
  });

  it('ships the Player, whose props ARE the service types', () => {
    expect(names(services)).toContain('Player');
  });
});

describe('the line between them', () => {
  it('shares NOT ONE name', () => {
    const overlap = names(kit).filter((name) => names(services).includes(name));
    expect(overlap).toEqual([]);
  });

  it('keeps the Player OUT of the organisms barrel', () => {
    expect(names(kit)).not.toContain('Player');
  });

  it('keeps the workbench out of both', () => {
    for (const module of [kit, services]) {
      expect(names(module).filter((n) => /workbench/i.test(n))).toEqual([]);
    }
  });
});
