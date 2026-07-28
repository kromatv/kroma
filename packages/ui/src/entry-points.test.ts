// The design system's two entry points, and the line between them.
//
// `@kroma/ui/kit` is the COMPONENT LIBRARY; `@kroma/ui` is the SERVICES - the
// hooks and providers that talk to the server or hold app state - plus `Player`,
// which is a component but ships from the root because its props are the service
// layer's own types.
//
// kit.ts says how that separation is kept: "enforced by omission rather than by
// a test". `Player` lives at components/organisms/player/ and is deliberately
// LEFT OUT of components/organisms/index.ts, and adding it there - the obvious
// thing to do, and what a new contributor tidying up an index would do first -
// makes both entry points export the same symbols. That is a duplicate-identifier
// build error in a consumer that imports from both, and a silently doubled
// bundle in one that does not.
//
// So it is a test now. Both barrels are imported here for real, which is also
// what proves neither of them is broken: a barrel that re-exports a name twice,
// or names a file that has moved, throws on IMPORT rather than at any call site.
//
// The barrels are loaded through the WEB resolution, the way every browser shell
// loads them. The overlap this guards is about NAMES, which are the same on both
// platforms, so one side is enough to state it - and the native side cannot load
// a barrel this wide under the runner anyway: something in the graph deep-imports
// `react-native/Libraries/...`, which the anchored react-native-web alias
// deliberately does not rewrite, so it lands on React Native's Flow source.

import { describe, expect, it } from 'vitest';
import * as services from './index';
import * as kit from './kit';

const names = (module: Record<string, unknown>) => Object.keys(module).sort();

describe('the kit', () => {
  it('imports at all', () => {
    // A barrel naming a file that has moved throws here rather than at a call
    // site in whichever shell happens to build first.
    expect(names(kit).length).toBeGreaterThan(0);
  });

  it('re-exports the four atomic levels FLAT', () => {
    // A consumer writes `import { Button, ListRow, Rail }` and never has to know
    // which level something sits at.
    for (const name of ['Button', 'Txt', 'Icon', 'ListRow', 'Rail', 'TvStage']) {
      expect(names(kit)).toContain(name);
    }
  });

  it('carries the cross-platform escape hatches and the tokens', () => {
    for (const name of ['gradient', 'backdropBlur', 'promote', 'boxStyle', 'sv']) {
      expect(names(kit)).toContain(name);
    }
  });

  it('exposes no default export', () => {
    // Every consumer imports by name; a default is a second way to say the same
    // thing and drifts.
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
    // The failure this catches: adding `Player` to components/organisms/index.ts
    // to "finish" that barrel. Both entry points then export it - a duplicate
    // identifier for a consumer importing from both, and a doubled bundle for
    // one that is not.
    expect(overlap).toEqual([]);
  });

  it('keeps the Player OUT of the organisms barrel', () => {
    // Stated directly, so the reason survives even if the two barrels are ever
    // rearranged: move the whole player over rather than listing it twice.
    expect(names(kit)).not.toContain('Player');
  });

  it('keeps the workbench out of both', () => {
    // It is a tool, not part of the library, and it pulls in every story - an
    // app that never opens it should never bundle it.
    for (const module of [kit, services]) {
      expect(names(module).filter((n) => /workbench/i.test(n))).toEqual([]);
    }
  });
});
