import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as webStyle from './web-style';

const CSS = readFileSync(fileURLToPath(new URL('../../styles.css', import.meta.url)), 'utf8')
  // A declaration inside a comment is prose, not paint.
  .replace(/\/\*[\s\S]*?\*\//g, '');

// `[^{}]` on both sides, so a nested rule is read on its own and the @media
// wrapping it never counts as one.
const RULES = [...CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selector, body]) => ({
  selector: selector ?? '',
  body: body ?? '',
}));

const CLASSES = Object.entries(webStyle).flatMap(([role, value]) =>
  typeof value === 'string' ? [[role, value] as [string, string]] : [],
);

const rulesFor = (name: string) =>
  RULES.filter((rule) => new RegExp(`\\.${name}(?![\\w-])`).test(rule.selector));

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

describe('the drawer scroll pane', () => {
  it('is the one region that scrolls, on one axis only', () => {
    expect(webStyle.SCROLL_PANE.overflowY).toBe('auto');
    expect(webStyle.SCROLL_PANE.overflowX).toBeUndefined();
  });

  it('may shrink below its content, which is what lets it scroll at all', () => {
    expect(webStyle.SCROLL_PANE.flex).toBe(1);
    expect(webStyle.SCROLL_PANE.minHeight).toBe(0);
  });
});
