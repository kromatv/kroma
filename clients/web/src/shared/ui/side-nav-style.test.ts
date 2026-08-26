import { CONTROL, color, radius, typeSpec } from '@kroma/ui/kit';
import { describe, expect, it } from 'vitest';
import { SIDE_NAV_GUTTER, sideNavRow } from './side-nav-style';

const SHELL = CONTROL.sm;

const RHYTHM = 2;

const REST = sideNavRow();
const HOVERED = sideNavRow({}, { hover: true });
const CURRENT = sideNavRow({ current: true });
const CURRENT_HOVERED = sideNavRow({ current: true }, { hover: true });
const UNREACHABLE = sideNavRow({}, { disabled: true });

describe('a navigation row', () => {
  it('wears the shape of the control shell rather than one of its own', () => {
    expect(REST.root.gap).toBe(SHELL.gap);
    expect(REST.root.minHeight).toBe(SHELL.height);
    expect(REST.root.paddingLeft).toBe(SHELL.px);
    expect(REST.root.borderRadius).toBe(radius[SHELL.radius]);
  });

  it('carries the rhythm between two rows as its own margin', () => {
    expect(REST.root.marginTop).toBe(RHYTHM / 2);
    expect(REST.root.marginBottom).toBe(RHYTHM / 2);
  });

  it('is exactly one control tall around the name it holds', () => {
    const line = Math.round(typeSpec.label.size * typeSpec.label.ratio);

    expect(REST.root.paddingTop).toBe(Math.round((SHELL.height - line) / 2));
    expect(Number(REST.root.paddingTop) * 2 + line).toBe(SHELL.height);
  });

  it('gives the name what the glyph and the tail leave', () => {
    expect(REST.label.flex).toBe(1);
    expect(REST.label.minWidth).toBe(0);
  });

  it('rests muted, lights under the pointer, takes the accent on the page it names', () => {
    expect(REST.label.color).toBe(color('textMuted'));
    expect(REST.root.backgroundColor).toBeUndefined();
    expect(HOVERED.root.backgroundColor).toBe(color('tint/4'));
    expect(HOVERED.label.color).toBe(color('text'));
    expect(CURRENT.root.backgroundColor).toBe(color('accentSoft'));
    expect(CURRENT.label.color).toBe(color('accentText'));
  });

  it('hovers a current row up the amber ladder, never back to the white wash', () => {
    expect(CURRENT_HOVERED.root.backgroundColor).toBe(color('accentSoftHover'));
    expect(CURRENT_HOVERED.label.color).toBe(color('accentText'));
  });

  it('inks the glyph with the name, since a colour does not cascade natively', () => {
    for (const face of [REST, HOVERED, CURRENT, CURRENT_HOVERED]) {
      expect(face.glyph.color).toBe(face.label.color);
    }
  });

  it('fades where it leads nowhere', () => {
    expect(Number(UNREACHABLE.root.opacity)).toBeLessThan(1);
    expect(REST.root.opacity).toBeUndefined();
  });

  it('paints from the palette, never in a colour written by hand', () => {
    for (const face of [REST, HOVERED, CURRENT, CURRENT_HOVERED, UNREACHABLE]) {
      for (const slot of Object.values(face)) {
        for (const value of Object.values(slot)) {
          if (typeof value !== 'string') continue;
          expect(value).toMatch(/^var\(--kroma-|^[a-z]+$/);
        }
      }
    }
  });

  it('is one shape under every face, so the console keeps no row of its own', () => {
    for (const face of [HOVERED, CURRENT, CURRENT_HOVERED, UNREACHABLE]) {
      expect(face.root).toMatchObject({
        minHeight: REST.root.minHeight,
        paddingLeft: REST.root.paddingLeft,
        paddingTop: REST.root.paddingTop,
        borderRadius: REST.root.borderRadius,
      });
    }
  });
});

describe('the navigation column', () => {
  it('shares one gutter with the rows it holds', () => {
    expect(SIDE_NAV_GUTTER).toBe(SHELL.px);
    expect(REST.root.paddingLeft).toBe(SIDE_NAV_GUTTER);
  });
});
