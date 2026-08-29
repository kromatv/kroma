import { pageRecord } from '../../page';
import { refresh } from '../../server/host';
import type { Engine, Inspector, Vars } from '../engine';

type Inputs = Record<string, unknown>;

type Rendering = (inputs?: Inputs, options?: { locale?: string }) => string;

/** A compiled paraglide message. The inputs and the options are each message's
 *  own, so this is the widest shape every one of them fits. */
export type Message = (...args: never[]) => string;

/** The `m` namespace `paraglide/messages.js` exports. */
export interface Messages {
  readonly [name: string]: Message;
}

/** What this adapter asks of `paraglide/runtime.js`. Declared here because
 *  there is nothing to import: `@inlang/paraglide-js` ships the compiler, and
 *  the runtime is generated into each app with that app's own locales baked
 *  into its types (`readonly ["en", "fr"]`). Structural is what lets one
 *  adapter fit every generated runtime. */
export interface Runtime<L extends string = string> {
  readonly locales: readonly L[];
  readonly getLocale: () => L;
  readonly overwriteGetLocale: (next: () => L) => void;
}

export interface ParaglideEngine<M extends Messages> extends Engine {
  readonly messages: M;
}

function ships<L extends string>(locales: readonly L[], locale: string): locale is L {
  return (locales as readonly string[]).includes(locale);
}

function watched(inputs: Inputs, read: Set<string>): Inputs {
  return new Proxy(inputs, {
    get(target, name, receiver) {
      if (typeof name === 'string') read.add(name);
      return Reflect.get(target, name, receiver);
    },
  });
}

// An input is whatever the app passed, and `String(x)` on an object reads
// `[object Object]`, which says nothing about what was rendered.
function text(value: unknown): string {
  return typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value);
}

function varsIn(inputs: Inputs): Vars | undefined {
  const vars: Vars = {};
  for (const [name, value] of Object.entries(inputs)) {
    if (value === undefined) continue;
    vars[name] = typeof value === 'number' ? value : text(value);
  }
  return Object.keys(vars).length > 0 ? vars : undefined;
}

const NOTHING: readonly string[] = [];

interface Wiring {
  engine: Engine | null;
  inspector: Inspector | null;
}

// Asking the dev server to re-run the module the messages come from is what
// puts a switch on the page, and that same run rebuilds this adapter. Both the
// engine and the switch it is set to are kept on the page, so a rebuild
// inherits them rather than clearing what the refresh was for.
const wiring = pageRecord<Wiring>('__kromaI18nParaglide', () => ({
  engine: null,
  inspector: null,
}));

/** The paraglide engine the app wired, doing nothing until it has. One page
 *  compiles one set of messages, so the last one built is the one to inspect. */
export const engine: Engine = {
  name: 'Paraglide',
  locales: () => wiring().engine?.locales() ?? NOTHING,
  activeLocale: () => wiring().engine?.activeLocale() ?? '',
  inspect: (next) => wiring().engine?.inspect(next),
  overrideLocale: (locale) => wiring().engine?.overrideLocale(locale),
};

/**
 * `overwriteGetLocale` replaces the resolver every compiled message calls, so
 * an override lasts as long as the page and no cookie moves.
 *
 * Each message compiles to a standalone function and the runtime has no hook
 * a message call passes through, so nothing can reach the text unless the app
 * renders through something this adapter owns. That is `messages`, and the
 * app has to import it in place of paraglide's own:
 *
 * ```ts
 * import { m as compiled } from './paraglide/messages';
 * import * as runtime from './paraglide/runtime';
 *
 * export const engine = paraglide({ runtime, messages: compiled });
 * export const m = engine.messages;
 * ```
 *
 * Handing the namespace to a function retains every message, so nothing
 * tree-shakes while the wrapper is in the graph. Only `m.hello()` is ever
 * seen, never a named `import { hello }`, which resolves straight to the
 * compiled function.
 *
 * `from` names the locale a message rendered in and never a fallback, because
 * the fallback chain is compiled into the function body and leaves nothing to
 * read from outside. And `from` is never absent, because a key no catalog
 * answers is a type error rather than a miss at runtime.
 */
export function paraglide<L extends string, M extends Messages>({
  runtime,
  messages,
}: {
  runtime: Runtime<L>;
  messages: M;
}): ParaglideEngine<M> {
  const wrappers = new Map<string | symbol, Rendering>();
  const held = wiring();
  let resolve: (() => L) | null = null;

  function wrap(key: string, message: Rendering): Rendering {
    return (inputs, options) => {
      const inspect = held.inspector;
      if (!inspect) return message(inputs, options);
      const given = inputs ?? {};
      const read = new Set<string>();
      const text = message(watched(given, read), options);
      const locale = options?.locale ?? runtime.getLocale();
      return inspect({
        key,
        from: { scope: null, locale },
        locale,
        text,
        vars: varsIn(given),
        holes: [...read].filter((hole) => given[hole] === undefined),
      });
    };
  }

  const api: ParaglideEngine<M> = {
    name: 'Paraglide',
    locales: () => runtime.locales,
    activeLocale: () => (resolve ?? runtime.getLocale)(),
    // Installing the same inspector twice has to be free: the refresh below
    // re-runs the module that installs it, and a second refresh from that run
    // would never stop.
    inspect(next) {
      if (held.inspector === next) return;
      held.inspector = next;
      refresh();
    },
    overrideLocale(locale) {
      resolve ??= runtime.getLocale;
      if (locale !== null && !ships(runtime.locales, locale)) return;
      const next: () => L = locale === null ? resolve : () => locale;
      if (runtime.getLocale() === next()) return;
      runtime.overwriteGetLocale(next);
      refresh();
    },
    messages: new Proxy(messages, {
      get(target, name, receiver) {
        const value: unknown = Reflect.get(target, name, receiver);
        if (typeof value !== 'function') return value;
        const known = wrappers.get(name);
        if (known) return known;
        const made = wrap(String(name), value as Rendering);
        wrappers.set(name, made);
        return made;
      },
    }),
  };

  held.engine = api;
  return api;
}
