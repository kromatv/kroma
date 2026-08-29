import { describe, expect, it, vi } from 'vitest';
import type { Engine, Rendered } from '../engine';
import { paraglide } from './paraglide';

type Locale = 'en' | 'fr';

interface FakeRuntime {
  locales: readonly Locale[];
  getLocale: () => Locale;
  overwriteGetLocale: (next: () => Locale) => void;
}

function runtimeFor(resolved: Locale): FakeRuntime {
  const runtime: FakeRuntime = {
    locales: ['en', 'fr'],
    getLocale: () => resolved,
    overwriteGetLocale: (next) => {
      runtime.getLocale = next;
    },
  };
  return runtime;
}

function messagesFor(runtime: FakeRuntime) {
  return {
    hello: (inputs?: { name?: unknown }, options?: { locale?: string }) =>
      (options?.locale ?? runtime.getLocale()) === 'fr'
        ? `Bonjour ${inputs?.name}`
        : `Hello ${inputs?.name}`,
    unread: (inputs?: { count?: unknown; name?: unknown }) =>
      `${inputs?.count} for ${inputs?.name}`,
  };
}

function adapter(resolved: Locale = 'en') {
  const runtime = runtimeFor(resolved);
  return paraglide({ runtime, messages: messagesFor(runtime) });
}

// What the adapter holds outlives a module reload on purpose, so a test that
// wants a fresh page has to say so.
async function reloaded({ page = 'fresh' }: { page?: 'fresh' | 'same' } = {}) {
  if (page === 'fresh') Reflect.deleteProperty(globalThis, '__kromaI18nParaglide');
  vi.resetModules();
  return await import('./paraglide');
}

function inspected(engine: Engine): Rendered[] {
  const seen: Rendered[] = [];
  engine.inspect((rendered) => {
    seen.push(rendered);
    return rendered.text;
  });
  return seen;
}

describe('the project a paraglide adapter speaks for', () => {
  it('offers every locale the project ships', () => {
    expect(adapter().locales()).toEqual(['en', 'fr']);
  });

  it('reports the locale the app resolved on its own', () => {
    expect(adapter('fr').activeLocale()).toBe('fr');
  });
});

describe('overriding the locale', () => {
  it('renders every message in the locale it is given', () => {
    const engine = adapter();

    engine.overrideLocale('fr');

    expect(engine.messages.hello({ name: 'Ada' })).toBe('Bonjour Ada');
  });

  it('still reports the locale the app resolved while an override stands', () => {
    const engine = adapter();

    engine.overrideLocale('fr');

    expect(engine.activeLocale()).toBe('en');
  });

  it('gives the app its own resolution back', () => {
    const engine = adapter();
    engine.overrideLocale('fr');

    engine.overrideLocale(null);

    expect(engine.messages.hello({ name: 'Ada' })).toBe('Hello Ada');
  });

  it('ignores a locale the project does not ship', () => {
    const engine = adapter();

    engine.overrideLocale('de');

    expect(engine.messages.hello({ name: 'Ada' })).toBe('Hello Ada');
  });

  it('leaves the app resolving for itself when told to clear an override it never had', () => {
    const engine = adapter('fr');

    engine.overrideLocale(null);

    expect(engine.messages.hello({ name: 'Ada' })).toBe('Bonjour Ada');
  });
});

describe('the messages the app renders', () => {
  it('hands the app its own text back until an inspector is installed', () => {
    expect(adapter().messages.hello({ name: 'Ada' })).toBe('Hello Ada');
  });

  it('renders every message through the inspector once one is', () => {
    const engine = adapter();

    engine.inspect(({ text }) => `[${text}]`);

    expect(engine.messages.hello({ name: 'Ada' })).toBe('[Hello Ada]');
  });

  it('stops at the app own text when the inspector is taken away', () => {
    const engine = adapter();
    engine.inspect(({ text }) => `[${text}]`);

    engine.inspect(null);

    expect(engine.messages.hello({ name: 'Ada' })).toBe('Hello Ada');
  });

  it('names a message by the export the app called', () => {
    const engine = adapter();
    const seen = inspected(engine);

    engine.messages.hello({ name: 'Ada' });

    expect(seen[0]?.key).toBe('hello');
  });

  it('says the app own catalogs answered, in the locale it rendered', () => {
    const engine = adapter('fr');
    const seen = inspected(engine);

    engine.messages.hello({ name: 'Ada' });

    expect(seen[0]).toMatchObject({ from: { scope: null, locale: 'fr' }, locale: 'fr' });
  });

  it('reports the locale a call asked for outright', () => {
    const engine = adapter();
    const seen = inspected(engine);

    engine.messages.hello({ name: 'Ada' }, { locale: 'fr' });

    expect(seen[0]?.locale).toBe('fr');
  });

  it('reports the values a message was rendered with, keeping a number a number', () => {
    const engine = adapter();
    const seen = inspected(engine);

    engine.messages.unread({ count: 2, name: 'Ada' });

    expect(seen[0]?.vars).toEqual({ count: 2, name: 'Ada' });
    expect(seen[0]?.holes).toEqual([]);
  });

  it('counts an input given no value as a hole rather than a variable', () => {
    const engine = adapter();
    const seen = inspected(engine);

    engine.messages.unread({ count: 2, name: undefined });

    expect(seen[0]?.holes).toEqual(['name']);
    expect(seen[0]?.vars).toEqual({ count: 2 });
  });

  it('reports an object input as what it holds, not as its default stringification', () => {
    const engine = adapter();
    const seen = inspected(engine);

    engine.messages.unread({ count: { of: 2 }, name: 'Ada' });

    expect(seen[0]?.vars).toEqual({ count: '{"of":2}', name: 'Ada' });
  });

  it('reports a null input as null rather than as an object', () => {
    const engine = adapter();
    const seen = inspected(engine);

    engine.messages.unread({ count: null, name: 'Ada' });

    expect(seen[0]?.vars).toEqual({ count: 'null', name: 'Ada' });
  });

  it('reports no variables for a message given none', () => {
    const engine = adapter();
    const seen = inspected(engine);

    engine.messages.unread();

    expect(seen[0]?.vars).toBeUndefined();
    expect(seen[0]?.holes).toEqual(['count', 'name']);
  });

  it('ignores a symbol a message reads off its inputs', () => {
    const engine = paraglide({
      runtime: runtimeFor('en'),
      messages: { whole: (inputs: object) => `${inputs}` },
    });
    const seen = inspected(engine);

    engine.messages.whole({});

    expect(seen[0]?.holes).toEqual([]);
  });

  it('hands back one function per message, because a new identity re-renders every string', () => {
    const engine = adapter();

    expect(engine.messages.hello).toBe(engine.messages.hello);
  });

  it('hands back nothing for a name the project has no message for', () => {
    const engine = adapter();

    expect(Reflect.get(engine.messages, 'goodbye')).toBeUndefined();
  });
});

describe('the engine the panel reaches without being handed one', () => {
  it('does nothing at all until the app builds an adapter', async () => {
    const { engine } = await reloaded();

    engine.inspect(({ text }) => text);
    engine.overrideLocale('fr');

    expect(engine.locales()).toEqual([]);
    expect(engine.activeLocale()).toBe('');
  });

  it('answers for the adapter the app built', async () => {
    const paraglide = await reloaded();
    const runtime = runtimeFor('fr');

    paraglide.paraglide({ runtime, messages: messagesFor(runtime) });

    expect(paraglide.engine.locales()).toEqual(['en', 'fr']);
    expect(paraglide.engine.activeLocale()).toBe('fr');
  });

  it('carries both switches through to it', async () => {
    const paraglide = await reloaded();
    const runtime = runtimeFor('en');
    const built = paraglide.paraglide({ runtime, messages: messagesFor(runtime) });

    paraglide.engine.overrideLocale('fr');
    paraglide.engine.inspect(({ text }) => `[${text}]`);

    expect(built.messages.hello({ name: 'Ada' })).toBe('[Bonjour Ada]');
  });

  it('carries the inspector into the adapter a refresh rebuilds', async () => {
    const paraglide = await reloaded();
    const first = runtimeFor('en');
    paraglide.paraglide({ runtime: first, messages: messagesFor(first) });
    paraglide.engine.inspect(({ text }) => `[${text}]`);

    const again = await reloaded({ page: 'same' });
    const rebuilt = again.paraglide({ runtime: first, messages: messagesFor(first) });

    expect(rebuilt.messages.hello({ name: 'Ada' })).toBe('[Hello Ada]');
  });

  it('installs the inspector it already has without asking for another refresh', async () => {
    const paraglide = await reloaded();
    const runtime = runtimeFor('en');
    const built = paraglide.paraglide({ runtime, messages: messagesFor(runtime) });
    const inspector = ({ text }: Rendered) => `[${text}]`;
    built.inspect(inspector);

    built.inspect(inspector);

    expect(built.messages.hello({ name: 'Ada' })).toBe('[Hello Ada]');
  });

  it('asks for nothing when told to render the locale already showing', async () => {
    const paraglide = await reloaded();
    const runtime = runtimeFor('en');
    const built = paraglide.paraglide({ runtime, messages: messagesFor(runtime) });

    built.overrideLocale('en');

    expect(built.messages.hello({ name: 'Ada' })).toBe('Hello Ada');
  });
});
