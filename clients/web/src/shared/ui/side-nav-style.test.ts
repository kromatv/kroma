import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CONTROL, typeSpec } from '@kroma/ui/kit';
import { describe, expect, it } from 'vitest';
import {
  SIDE_NAV_COLUMN,
  SIDE_NAV_FRAME,
  SIDE_NAV_GUTTER,
  SIDE_NAV_LABEL,
  SIDE_NAV_ROW,
  SIDE_NAV_TRAILING,
} from './side-nav-style';

const CSS = readFileSync(fileURLToPath(new URL('../../styles.css', import.meta.url)), 'utf8');

// Keyed on what follows the class name, so a comment before a rule is never
// read as part of its selector.
const RULES = new Map(
  [...CSS.matchAll(new RegExp(`\\.${SIDE_NAV_ROW}([^{}]*)\\{([^{}]*)\\}`, 'g'))].map(
    ([, selector, body]) => [(selector ?? '').trim(), body ?? ''],
  ),
);

const rule = (selector: string): string => {
  const body = RULES.get(selector);
  if (body === undefined) throw new Error(`no .${SIDE_NAV_ROW}${selector} rule`);
  return body;
};

const declaration = (body: string, property: string): string =>
  (new RegExp(`(?:^|;)\\s*${property}\\s*:([^;]+)`).exec(body)?.[1] ?? '').trim();

const px = (value: string): number => Number(value.replace('px', ''));

const SHELL = CONTROL.sm;

// What sits between two rows, split half above and half below each one so the
// strip belongs to a row rather than to the column.
const RHYTHM = 2;

const ROW = rule('');
const HOVER = rule(':not([aria-disabled="true"]):hover');
const CURRENT = rule('[aria-current="page"]');
const UNREACHABLE = rule('[aria-disabled="true"]');

const [padY, padX] = declaration(ROW, 'padding').split(/\s+/).map(px);

describe('a navigation row', () => {
  it('wears the shape of the control shell rather than one of its own', () => {
    expect(px(declaration(ROW, 'gap'))).toBe(SHELL.gap);
    expect(px(declaration(ROW, 'min-height'))).toBe(SHELL.height + RHYTHM);
    expect(padX).toBe(SHELL.px);
    expect(declaration(ROW, 'border-radius')).toBe(`var(--radius-${SHELL.radius})`);
  });

  it('carries the rhythm between two rows inside its own box', () => {
    expect(declaration(ROW, 'border-block')).toBe(`${RHYTHM / 2}px solid transparent`);
    for (const body of [ROW, HOVER, CURRENT]) {
      expect(declaration(body, 'background-clip')).toBe('padding-box');
    }
    expect(SIDE_NAV_COLUMN.gap).toBeUndefined();
  });

  it('is exactly one control tall around the name it holds', () => {
    const line = typeSpec.label.size * typeSpec.label.ratio;
    expect(padY).toBe(Math.round((SHELL.height - line) / 2));
    expect(declaration(ROW, 'font')).toBe('var(--type-label)');
  });

  it('rests muted, lights under the pointer, takes the accent on the page it names', () => {
    expect(declaration(ROW, 'color')).toBe('var(--kroma-text-muted)');
    expect(declaration(HOVER, 'color')).toBe('var(--kroma-text)');
    expect(declaration(HOVER, 'background')).toBe('var(--kroma-tint-4)');
    expect(declaration(CURRENT, 'background')).toBe('var(--kroma-accent-soft)');
    expect(declaration(CURRENT, 'color')).toBe('var(--kroma-accent-text)');
  });

  it('fades where it leads nowhere, and answers no pointer there', () => {
    expect(Number(declaration(UNREACHABLE, 'opacity'))).toBeLessThan(1);
    expect(declaration(ROW, 'transition')).toContain('var(--dur-fast)');
  });

  it('paints in tokens, never in a colour written by hand', () => {
    for (const body of [ROW, HOVER, CURRENT, UNREACHABLE]) {
      expect(body).not.toMatch(/#[0-9a-f]{3,8}\b|\brgba?\(/i);
      for (const [, property] of body.matchAll(/var\((--[\w-]+)/g)) {
        expect(property).toMatch(/^--(kroma|radius|type|dur|ease|font)-/);
      }
    }
  });

  it('is the only row rule in the app: the console keeps no copy of it', () => {
    expect(CSS).not.toContain('admin-nav-link');
    expect(CSS).not.toContain('admin-sidebar-nav');
  });
});

describe('the navigation column', () => {
  it('shares one gutter with the rows it holds', () => {
    expect(SIDE_NAV_GUTTER).toBe(SHELL.px);
    expect(SIDE_NAV_COLUMN.paddingInline).toBe(SIDE_NAV_GUTTER);
  });

  it('grows to its frame, so a footer sits on the bottom edge', () => {
    expect(SIDE_NAV_COLUMN.display).toBe('flex');
    expect(SIDE_NAV_COLUMN.flexDirection).toBe('column');
    expect(SIDE_NAV_COLUMN.flex).toBe(1);
    expect(SIDE_NAV_COLUMN.minHeight).toBe(0);
  });

  it('scrolls on one axis in the frame an aside gives it', () => {
    expect(SIDE_NAV_FRAME.overflowY).toBe('auto');
    expect(SIDE_NAV_FRAME.flex).toBe(1);
    expect(SIDE_NAV_FRAME.minHeight).toBe(0);
  });
});

describe('the parts of a row', () => {
  it('gives the name what the glyph and the tail leave, cut rather than wrapped', () => {
    expect(SIDE_NAV_LABEL.flex).toBe(1);
    expect(SIDE_NAV_LABEL.minWidth).toBe(0);
    expect(SIDE_NAV_LABEL.whiteSpace).toBe('nowrap');
    expect(SIDE_NAV_LABEL.textOverflow).toBe('ellipsis');
  });

  it('holds the tail at the far end whatever the name measures', () => {
    expect(SIDE_NAV_TRAILING.marginLeft).toBe('auto');
    expect(SIDE_NAV_TRAILING.flexShrink).toBe(0);
  });
});
