import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as webStyle from './web-style';

// A declaration inside a comment is prose, not paint. Scanned rather than
// matched: a lazy run before a required `*/` rescans from every `/*`, which is
// quadratic on a stylesheet whose last comment is unclosed.
function uncommented(css: string): string {
  let out = '';
  let at = 0;
  for (;;) {
    const open = css.indexOf('/*', at);
    if (open === -1) return out + css.slice(at);
    out += css.slice(at, open);
    const close = css.indexOf('*/', open + 2);
    if (close === -1) return out;
    at = close + 2;
  }
}

const CSS = uncommented(
  readFileSync(fileURLToPath(new URL('../../styles.css', import.meta.url)), 'utf8'),
);

// `[^{}]` on both sides, so a nested rule is read on its own and the @media
// wrapping it never counts as one.
const RULES = [...CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selector, body]) => ({
  selector: selector ?? '',
  body: body ?? '',
}));

const CLASSES = Object.entries(webStyle).flatMap(([role, value]) =>
  typeof value === 'string' ? [[role, value] as [string, string]] : [],
);

// `.card` must not answer for `.card-header`, so the character after the name
// has to end it.
function names(selector: string, name: string): boolean {
  let at = selector.indexOf(`.${name}`);
  while (at !== -1) {
    const next = selector[at + name.length + 1] ?? '';
    if (next === '' || !/[\w-]/.test(next)) return true;
    at = selector.indexOf(`.${name}`, at + 1);
  }
  return false;
}

const rulesFor = (name: string) => RULES.filter((rule) => names(rule.selector, name));

const propertiesIn = (body: string) =>
  [...body.matchAll(/var\((--[\w-]+)/g)].map(([, property]) => property ?? '');

// The two the table sets inline per instance (see ./table.tsx); every other
// custom property these rules name has to be a design token.
const LOCAL = /^--admin-table-(columns|narrow)$/;
const TOKEN = /^--(kroma|radius|type|dur|ease|ring|shadow|glow|gutter|card)-/;

describe('the admin class names', () => {
  it('names the rules the app actually carries, none of them dead', () => {
    expect(CLASSES.length).toBeGreaterThan(0);
    for (const [role, name] of CLASSES) {
      expect(rulesFor(name), role).not.toHaveLength(0);
    }
  });

  it('paints nothing in a colour written by hand', () => {
    for (const [role, name] of CLASSES) {
      for (const rule of rulesFor(name)) {
        expect(rule.body, `${role} ${rule.selector.trim()}`).not.toMatch(
          /#[0-9a-f]{3,8}\b|\brgba?\(/i,
        );
      }
    }
  });

  it('takes every colour, corner, duration and easing from a token', () => {
    for (const [role, name] of CLASSES) {
      for (const rule of rulesFor(name)) {
        for (const property of propertiesIn(rule.body)) {
          expect(TOKEN.test(property) || LOCAL.test(property), `${role} names ${property}`).toBe(
            true,
          );
        }
      }
    }
  });
});
