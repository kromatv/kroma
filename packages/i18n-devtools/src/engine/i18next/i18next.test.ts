import { describe, expect, it } from 'vitest';
import type { Rendered } from '../engine';
import { type I18n, i18next } from './i18next';

type Processor = Parameters<I18n['use']>[0];
type Asked = Parameters<Processor['process']>[2];

function fake(over: Partial<I18n> = {}) {
  const emitted: string[] = [];
  const changed: string[] = [];
  const registered: Processor[] = [];
  const i18n: I18n = {
    language: 'en',
    options: {},
    use: (module) => registered.push(module),
    emit: (event) => emitted.push(event),
    changeLanguage: (locale) => {
      changed.push(locale);
      i18n.language = locale;
      return Promise.resolve();
    },
    ...over,
  };
  const render = (text: string, key: string, asked: Asked = {}) => {
    const [processor] = registered;
    return processor ? processor.process(text, key, asked) : text;
  };
  return { i18n, emitted, changed, registered, render };
}

function inspected(text: string, asked: Asked = {}, over: Partial<I18n> = {}): Rendered {
  const { i18n, render } = fake(over);
  const seen: Rendered[] = [];
  i18next(i18n).inspect((rendered) => {
    seen.push(rendered);
    return rendered.text;
  });
  render(text, 'greeting', asked);
  const [first] = seen;
  if (!first) throw new Error('the post-processor never ran');
  return first;
}

describe('turning inspection on', () => {
  it('appends itself to the post-processor the app already named', () => {
    const { i18n } = fake({ options: { postProcess: 'sprintf' } });

    i18next(i18n).inspect(() => 'x');

    expect(i18n.options.postProcess).toEqual(['sprintf', 'kroma-i18n-devtools']);
  });

  it('appends itself to the post-processors the app already listed', () => {
    const { i18n } = fake({ options: { postProcess: ['sprintf', 'interval'] } });

    i18next(i18n).inspect(() => 'x');

    expect(i18n.options.postProcess).toEqual(['sprintf', 'interval', 'kroma-i18n-devtools']);
  });

  it('asks i18next to pass what it resolved', () => {
    const { i18n } = fake();

    i18next(i18n).inspect(() => 'x');

    expect(i18n.options.postProcessPassResolved).toBe(true);
  });

  it('emits a language change, the event react-i18next re-renders on', () => {
    const { i18n, emitted } = fake();

    i18next(i18n).inspect(() => 'x');

    expect(emitted).toEqual(['languageChanged']);
  });

  it('registers its post-processor once however often it is switched', () => {
    const { i18n, registered } = fake();
    const engine = i18next(i18n);

    engine.inspect(() => 'a');
    engine.inspect(null);
    engine.inspect(() => 'b');

    expect(registered).toHaveLength(1);
  });

  it('names itself once after the inspector is swapped', () => {
    const { i18n } = fake();
    const engine = i18next(i18n);

    engine.inspect(() => 'a');
    engine.inspect(() => 'b');

    expect(i18n.options.postProcess).toEqual(['kroma-i18n-devtools']);
  });

  it('does nothing when handed the inspector it already has', () => {
    const { i18n, emitted } = fake();
    const engine = i18next(i18n);
    const inspector = () => 'x';

    engine.inspect(inspector);
    engine.inspect(inspector);

    expect(emitted).toEqual(['languageChanged']);
  });
});

describe('turning inspection off', () => {
  it('gives the app back the post-processors and the flag it owned', () => {
    const { i18n } = fake({
      options: { postProcess: ['sprintf'], postProcessPassResolved: false },
    });
    const engine = i18next(i18n);

    engine.inspect(() => 'x');
    engine.inspect(null);

    expect(i18n.options.postProcess).toEqual(['sprintf']);
    expect(i18n.options.postProcessPassResolved).toBe(false);
  });

  it('leaves the flag unset where the app never set it', () => {
    const { i18n } = fake();
    const engine = i18next(i18n);

    engine.inspect(() => 'x');
    engine.inspect(null);

    expect(i18n.options.postProcessPassResolved).toBeUndefined();
  });

  it('hands the text back untouched once it has stopped', () => {
    const { i18n, render } = fake();
    const engine = i18next(i18n);

    engine.inspect(() => 'inspected');
    engine.inspect(null);

    expect(render('Connexion', 'auth.login')).toBe('Connexion');
  });

  it('does nothing when told to stop before it ever started', () => {
    const { i18n, emitted } = fake();

    i18next(i18n).inspect(null);

    expect(emitted).toEqual([]);
  });
});

describe('a message as the adapter reports it', () => {
  it('names the key i18next resolved rather than the last one asked for', () => {
    const rendered = inspected('Bonjour', { i18nResolved: { exactUsedKey: 'greeting.morning' } });

    expect(rendered.key).toBe('greeting.morning');
  });

  it('falls back to the key it was handed when i18next resolved none', () => {
    expect(inspected('Bonjour').key).toBe('greeting');
  });

  it('reports the namespace and the locale that answered', () => {
    const rendered = inspected('Bonjour', {
      i18nResolved: { res: 'Bonjour', usedNS: 'common', usedLng: 'fr' },
    });

    expect(rendered.from).toEqual({ scope: 'common', locale: 'fr' });
  });

  it("scopes an answer naming no namespace to the app's own catalogs", () => {
    const rendered = inspected('Bonjour', { i18nResolved: { res: 'Bonjour', usedLng: 'fr' } });

    expect(rendered.from).toEqual({ scope: null, locale: 'fr' });
  });

  it('falls back to the asked locale for an answer naming none', () => {
    const rendered = inspected('Bonjour', { lng: 'de', i18nResolved: { res: 'Bonjour' } });

    expect(rendered.from).toEqual({ scope: null, locale: 'de' });
  });

  it('reports no source when nothing answered', () => {
    const rendered = inspected('greeting', { i18nResolved: { usedNS: 'common', usedLng: 'fr' } });

    expect(rendered.from).toBeUndefined();
  });

  it('reports the locale the call asked for', () => {
    expect(inspected('Bonjour', { lng: 'de' }).locale).toBe('de');
  });

  it('falls back to the language i18next resolved when the call asked for none', () => {
    expect(inspected('Bonjour', {}, { resolvedLanguage: 'fr' }).locale).toBe('fr');
  });

  it('falls back to the configured language when i18next resolved none', () => {
    expect(inspected('Bonjour', {}, { language: 'nl' }).locale).toBe('nl');
  });

  it('carries the variables i18next used, anything but a number as text', () => {
    const rendered = inspected('Bonjour Alice', {
      i18nResolved: { usedParams: { name: 'Alice', count: 2, formal: false } },
    });

    expect(rendered.vars).toEqual({ name: 'Alice', count: 2, formal: 'false' });
  });

  it('carries no variables for a call that passed none', () => {
    expect(inspected('Bonjour').vars).toBeUndefined();
  });
});

describe('the placeholders a message was given no value for', () => {
  it('names every one i18next kept verbatim', () => {
    expect(inspected('Bonjour {{name}}, {{count}} restants').holes).toEqual(['name', 'count']);
  });

  it('drops the format i18next would have applied', () => {
    expect(inspected('{{count, number}} messages').holes).toEqual(['count']);
  });

  it('trims the padding a placeholder is written with', () => {
    expect(inspected('Bonjour {{ name }}').holes).toEqual(['name']);
  });

  it("reads the instance's own delimiters", () => {
    const rendered = inspected(
      'Bonjour __name__',
      {},
      { options: { interpolation: { prefix: '__', suffix: '__' } } },
    );

    expect(rendered.holes).toEqual(['name']);
  });

  it('escapes a delimiter that is a regular expression of its own', () => {
    const rendered = inspected(
      'Bonjour $(name)',
      {},
      { options: { interpolation: { prefix: '$(', suffix: ')' } } },
    );

    expect(rendered.holes).toEqual(['name']);
  });

  it('finds none in a message with every placeholder filled', () => {
    expect(inspected('Bonjour Alice').holes).toEqual([]);
  });
});

describe('the locale', () => {
  it('renders every message in the one it is handed', () => {
    const { i18n, changed } = fake();

    i18next(i18n).overrideLocale('de');

    expect(changed).toEqual(['de']);
  });

  it('goes back to the language the app started on, not the last override', () => {
    const { i18n, changed } = fake({ language: 'fr' });
    const engine = i18next(i18n);

    engine.overrideLocale('de');
    engine.overrideLocale('it');
    engine.overrideLocale(null);

    expect(changed).toEqual(['de', 'it', 'fr']);
  });

  it('has nothing to give back when none was ever overridden', () => {
    const { i18n, changed } = fake();

    i18next(i18n).overrideLocale(null);

    expect(changed).toEqual([]);
  });

  it('offers the ones the instance supports, without the pseudo-locale i18next appends', () => {
    const { i18n } = fake({ options: { supportedLngs: ['fr', 'en', 'cimode'] } });

    expect(i18next(i18n).locales()).toEqual(['fr', 'en']);
  });

  it('falls back to the ones the resource store holds', () => {
    const { i18n } = fake({ services: { resourceStore: { data: { fr: {}, en: {} } } } });

    expect(i18next(i18n).locales()).toEqual(['fr', 'en']);
  });

  it('offers none where the instance names none at all', () => {
    expect(i18next(fake().i18n).locales()).toEqual([]);
  });

  it('reports the language i18next resolved as the active one', () => {
    expect(i18next(fake({ resolvedLanguage: 'fr-CH' }).i18n).activeLocale()).toBe('fr-CH');
  });

  it('reports the configured language as active where i18next resolved none', () => {
    expect(i18next(fake({ language: 'nl' }).i18n).activeLocale()).toBe('nl');
  });
});

describe('a plural category', () => {
  it("is the plural resolver's suffix without its leading underscore", () => {
    const { i18n } = fake({ services: { pluralResolver: { getSuffix: () => '_one' } } });

    expect(i18next(i18n).categoryOf?.('fr', 1)).toBe('one');
  });

  it('is asked about the locale and the count the tools named', () => {
    const { i18n } = fake({
      services: { pluralResolver: { getSuffix: (locale, count) => `_${locale}-${count}` } },
    });

    expect(i18next(i18n).categoryOf?.('cy', 3)).toBe('cy-3');
  });

  it('is empty where the instance has no plural resolver, for CLDR to name', () => {
    expect(i18next(fake().i18n).categoryOf?.('fr', 1)).toBe('');
  });
});
