import type { Engine, Inspector, Rendered, Vars } from '../engine';

const NAME = 'kroma-i18n-devtools';
const METACHARACTER = /[.*+?^${}()|[\]\\]/g;

interface Resolution {
  res?: unknown;
  exactUsedKey?: string;
  usedLng?: string;
  usedNS?: string;
  usedParams?: Record<string, unknown>;
}

interface TranslateOptions {
  lng?: string;
  i18nResolved?: Resolution;
}

interface PostProcessor {
  type: 'postProcessor';
  name: string;
  process(value: string, key: string, options: TranslateOptions): string;
}

interface I18nOptions {
  postProcess?: string | string[];
  postProcessPassResolved?: boolean;
  supportedLngs?: string[] | false;
  interpolation?: { prefix?: string; suffix?: string };
}

export interface I18n {
  language: string;
  resolvedLanguage?: string;
  options: I18nOptions;
  services?: {
    resourceStore?: { data?: Record<string, unknown> };
    pluralResolver?: { getSuffix(locale: string, count: number): string };
  };
  use(module: PostProcessor): unknown;
  emit(event: string, locale: string): void;
  changeLanguage(locale: string): Promise<unknown>;
}

interface Attached {
  readonly inspector: Inspector;
  readonly postProcess: I18nOptions['postProcess'];
  readonly passResolved: boolean | undefined;
}

function listed(postProcess: I18nOptions['postProcess']): string[] {
  if (typeof postProcess === 'string') return [postProcess];
  return postProcess ? [...postProcess] : [];
}

function varsOf(params: Record<string, unknown> | undefined): Vars | undefined {
  if (!params) return undefined;
  const vars: Vars = {};
  for (const [name, value] of Object.entries(params)) {
    vars[name] = typeof value === 'number' ? value : String(value);
  }
  return vars;
}

function nameOf(placeholder: string): string {
  const format = placeholder.indexOf(',');
  return (format === -1 ? placeholder : placeholder.slice(0, format)).trim();
}

function holeScanner({
  prefix = '{{',
  suffix = '}}',
}: NonNullable<I18nOptions['interpolation']> = {}): (text: string) => string[] {
  const quoted = (delimiter: string) => delimiter.replace(METACHARACTER, String.raw`\$&`);
  const pattern = new RegExp(`${quoted(prefix)}.+?${quoted(suffix)}`, 'g');
  return (text) =>
    [...text.matchAll(pattern)].map(([hole]) => nameOf(hole.slice(prefix.length, -suffix.length)));
}

/**
 * Inspection goes through a post-processor named `kroma-i18n-devtools`,
 * appended to whatever `postProcess` the app already set and taken back off on
 * `inspect(null)`. Each flip emits `languageChanged`, the event react-i18next
 * re-renders on.
 *
 * `holes` come from scanning the rendered text for the instance's own
 * interpolation delimiters, which works because i18next keeps a placeholder it
 * was given no value for (`skipOnVariables`, its default). An instance that
 * turns that off reports none, and the adapter never reads
 * `missingInterpolationHandler`.
 */
export function i18next(instance: I18n): Engine {
  let attached: Attached | null = null;
  let registered = false;
  let scan = holeScanner();
  let original: string | null = null;

  function rendered(value: string, key: string, options: TranslateOptions): Rendered {
    const resolved = options.i18nResolved;
    const locale = options.lng ?? instance.resolvedLanguage ?? instance.language;
    return {
      key: resolved?.exactUsedKey ?? key,
      from:
        resolved?.res !== undefined
          ? { scope: resolved.usedNS ?? null, locale: resolved.usedLng ?? locale }
          : undefined,
      locale,
      text: value,
      vars: varsOf(resolved?.usedParams),
      holes: scan(value),
    };
  }

  const processor: PostProcessor = {
    type: 'postProcessor',
    name: NAME,
    process: (value, key, options) => {
      const inspector = attached?.inspector;
      return inspector ? inspector(rendered(value, key, options)) : value;
    },
  };

  function attach(inspector: Inspector): Attached {
    if (!registered) {
      instance.use(processor);
      registered = true;
    }
    scan = holeScanner(instance.options.interpolation);
    const own: Attached = {
      inspector,
      postProcess: instance.options.postProcess,
      passResolved: instance.options.postProcessPassResolved,
    };
    instance.options.postProcess = [...listed(own.postProcess), NAME];
    instance.options.postProcessPassResolved = true;
    return own;
  }

  function detach(from: Attached): void {
    instance.options.postProcess = from.postProcess;
    instance.options.postProcessPassResolved = from.passResolved;
  }

  return {
    name: 'i18next',
    locales: () => {
      const { supportedLngs } = instance.options;
      if (Array.isArray(supportedLngs)) return supportedLngs.filter((code) => code !== 'cimode');
      return Object.keys(instance.services?.resourceStore?.data ?? {});
    },
    activeLocale: () => instance.resolvedLanguage ?? instance.language,
    inspect: (inspector) => {
      if (inspector === (attached?.inspector ?? null)) return;
      if (attached) detach(attached);
      attached = inspector && attach(inspector);
      instance.emit('languageChanged', instance.language);
    },
    overrideLocale: (locale) => {
      if (locale === null) {
        if (original !== null) void instance.changeLanguage(original);
        original = null;
        return;
      }
      original ??= instance.resolvedLanguage ?? instance.language;
      void instance.changeLanguage(locale);
    },
    categoryOf: (locale, count) =>
      (instance.services?.pluralResolver?.getSuffix(locale, count) ?? '').replace(/^_/, ''),
  };
}
