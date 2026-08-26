import { interpolate, type TVars } from '@kroma/i18n';

type MessageLookup = (key: string, vars?: TVars) => string;

// A validator's error message is one string, so the vars ride along in a query
// tail: `form.tooShort?min=8`. Only a tail that is entirely `name=value` pairs
// counts, which leaves an ordinary sentence ending in "?" alone.
const VAR_TAIL = /^\w+=[^&]*(?:&\w+=[^&]*)*$/;

/** Packs a message key and its interpolation vars into the single string a validator
 *  can carry as its error, for `useForm` to unpack again through `t`. */
function msg(key: string, vars?: TVars): string {
  const entries = Object.entries(vars ?? {});
  if (entries.length === 0) return key;
  const tail = entries
    .map(([name, value]) => `${name}=${encodeURIComponent(String(value))}`)
    .join('&');
  return `${key}?${tail}`;
}

function unpack(message: string): { key: string; vars?: TVars } {
  const cut = message.lastIndexOf('?');
  if (cut < 0) return { key: message };
  const tail = message.slice(cut + 1);
  if (!VAR_TAIL.test(tail)) return { key: message };

  const vars: TVars = {};
  for (const pair of tail.split('&')) {
    const equals = pair.indexOf('=');
    const name = pair.slice(0, equals);
    const value = decodeURIComponent(pair.slice(equals + 1));
    // `count` has to reach the catalog as a number or plural selection breaks.
    const numeric = Number(value);
    vars[name] = value !== '' && !Number.isNaN(numeric) ? numeric : value;
  }
  return { key: message.slice(0, cut), vars };
}

/** Turns a validator's message into display copy: a catalog key when `t` knows it,
 *  otherwise the message itself, and either way with `msg()`'s vars filled in. */
function resolveMessage(message: string, t?: MessageLookup): string {
  const { key, vars } = unpack(message);
  return interpolate(t?.(key, vars) ?? key, vars);
}

export type { MessageLookup };
export { msg, resolveMessage };
