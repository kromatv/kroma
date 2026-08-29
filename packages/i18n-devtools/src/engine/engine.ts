/** The variables a message was rendered with. */
export type Vars = Record<string, string | number>;

/** What answered a message: the catalog's own scope, and the locale it speaks.
 *  A scope is `null` for the app's own catalogs. */
export interface Answered {
  readonly scope: string | null;
  readonly locale: string;
}

/** One message, as the engine resolved it. `from` is absent where nothing
 *  answered, and `text` is what would have rendered. */
export interface Rendered {
  readonly key: string;
  readonly from: Answered | undefined;
  readonly locale: string;
  readonly text: string;
  readonly vars: Vars | undefined;
  /** The placeholders the message named and was given no value for. The
   *  adapter's to fill: an engine that drops an unfilled placeholder rather
   *  than keeping it leaves nothing in `text` to find them by. */
  readonly holes: readonly string[];
}

/** Renders a message as something other than its text: the key it came from, a
 *  mark the overlay reads, or the text itself for one that only watches. */
export type Inspector = (rendered: Rendered) => string;

/**
 * The engine the panel is inspecting.
 *
 * Everything the tools need from one, and nothing about which one it is: the
 * two switches, the locales to offer, and the two questions only an engine can
 * answer about a message it rendered. An adapter ships beside the engine it
 * speaks for, as a peer, so the panel itself depends on no engine at all.
 */
export interface Engine {
  /** What to call this engine in the panel, as its own docs spell it. */
  readonly name: string;
  /** Every locale the app ships, in the order to offer them. The same value
   *  until it genuinely changes: the panel polls this through React. */
  locales(): readonly string[];
  /** The locale the app resolved on its own, before any override. */
  activeLocale(): string;
  /** Route every message through `inspect`, or `null` to stop. */
  inspect(inspect: Inspector | null): void;
  /** Render every message in `locale`, or `null` to give the app its own back. */
  overrideLocale(locale: string | null): void;
  /** The plural category `count` falls in, where the engine names it
   *  differently from `Intl.PluralRules`. */
  categoryOf?(locale: string, count: number): string;
  /** Call `listener` whenever the answers above change, for an engine whose
   *  locales are not settled before the tools mount. Returns a disposer. */
  subscribe?(listener: () => void): () => void;
}

const NOTHING: readonly string[] = [];

const NONE: Engine = {
  name: '',
  locales: () => NOTHING,
  activeLocale: () => 'en',
  inspect: () => {},
  overrideLocale: () => {},
};

let installed: Engine = NONE;

/** Give the tools the engine to inspect. */
export function setEngine(engine: Engine | null): void {
  installed = engine ?? NONE;
}

/** The engine the tools are inspecting, doing nothing until one is given. */
export function engine(): Engine {
  return installed;
}
