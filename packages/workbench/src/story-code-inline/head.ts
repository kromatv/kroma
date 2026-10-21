import { matching } from './matching';

interface Head {
  names: string[];
  /** The parameter that IS the whole args bag, when there is one. */
  bag: string | null;
  /** Whether the arrow genuinely took nothing, as against a list unread. */
  empty: boolean;
  end: number;
}

const NAME = /^[A-Za-z_$][\w$]*$/;

const ARROW_HEAD = /^\s*=>\s*/;
const SINGLE_PARAM = /^([A-Za-z_$][\w$]*)\s*=>\s*/;
const LEADING_NAME = /^[A-Za-z_$][\w$]*/;

// A parameter without its type: everything before the first `:` or `=`.
function bare(part: string): string {
  let cut = part.length;
  for (let at = 0; at < part.length; at += 1) {
    const char = part[at];
    if (char === ':' || char === '=') {
      cut = at;
      break;
    }
  }
  return part.slice(0, cut).trim();
}

// The parameter list, when the source opens with an arrow that takes one. Only
// the two shapes a story can be written in: a destructured bag, or one name.
function head(code: string): Head | null {
  if (code.startsWith('(')) {
    const close = matching(code, 0, '(');
    if (close < 0) return null;
    const arrow = ARROW_HEAD.exec(code.slice(close + 1));
    if (!arrow) return null;
    const params = binding(code.slice(1, close));
    return {
      names: destructured(params),
      bag: whole(params),
      empty: params === '',
      end: close + 1 + arrow[0].length,
    };
  }
  const single = SINGLE_PARAM.exec(code);
  if (!single?.[1]) return null;
  return { names: [single[1]], bag: single[1], empty: false, end: single[0].length };
}

// The parameter without its type, since a story may write `(args: Args) =>` and
// what is bound is the part before the colon.
function binding(params: string): string {
  const text = params.trim();
  if (text.startsWith('{')) {
    const close = matching(text, 0, '{');
    return close < 0 ? text : text.slice(0, close + 1);
  }
  return LEADING_NAME.exec(text)?.[0] ?? text;
}

function destructured(params: string): string[] {
  if (NAME.test(params)) return [params];
  if (!params.startsWith('{') || !params.endsWith('}')) return [];
  return params
    .slice(1, -1)
    .split(',')
    .map((part) => bare(part))
    .filter((name) => NAME.test(name));
}

// `(props) => ... {...props}` spreads the whole bag, so the attributes it stands
// for are the args themselves. A REST of a destructured bag is not this: what it
// holds is whatever was not named, which the source alone does not say.
function whole(params: string): string | null {
  return NAME.test(params.trim()) ? params.trim() : null;
}

export { head, NAME };
