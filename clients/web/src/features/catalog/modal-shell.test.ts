import { color } from '@kromatv/ui/kit';
import { describe, expect, it } from 'vitest';
import { MODAL_SCRIM, SCRIM_Z } from '#web/shared/ui/page';
import { FOOTER_RULE, HEADER_RULE, MODAL_BODY, MODAL_LAYER, modalPanel } from './modal-shell';

const read = (style: object, key: string): unknown => Reflect.get(style, key);

const flat = (layers: object[]): Record<string, unknown> => Object.assign({}, ...layers);

const LAYER = MODAL_LAYER;
const BODY = MODAL_BODY;
const PANEL = flat(modalPanel(768));

describe('the modal layer', () => {
  it('covers the window rather than a place in the page', () => {
    expect(read(LAYER, 'position')).toBe('fixed');
    expect(read(LAYER, 'inset')).toBe(0);
  });

  it('floats above the scrim it shares the page with', () => {
    expect(read(MODAL_SCRIM, 'zIndex')).toBe(SCRIM_Z);
    expect(read(LAYER, 'zIndex') as number).toBeGreaterThan(SCRIM_Z);
  });

  it('centres whatever it holds', () => {
    expect(read(LAYER, 'display')).toBe('flex');
    expect(read(LAYER, 'alignItems')).toBe('center');
    expect(read(LAYER, 'justifyContent')).toBe('center');
  });

  it('lets the page through everywhere the panel is not', () => {
    expect(read(LAYER, 'pointerEvents')).toBe('none');
    expect(PANEL.pointerEvents).toBe('auto');
  });
});

describe('the modal panel', () => {
  it('fills the width up to the cap its caller states', () => {
    expect(PANEL.width).toBe('100%');
    expect(flat(modalPanel(512)).maxWidth).toBe(512);
    expect(flat(modalPanel(1024)).maxWidth).toBe(1024);
  });

  it('never grows past the layer it floats in', () => {
    expect(PANEL.maxHeight).toBe('88%');
  });

  it('clips itself and scrolls its body, so the header and footer stay put', () => {
    expect(PANEL.overflow).toBe('hidden');
    expect(PANEL.display).toBe('flex');
    expect(PANEL.flexDirection).toBe('column');
    expect(read(BODY, 'flex')).toBe(1);
    expect(read(BODY, 'overflowY')).toBe('auto');
    // A flex child refuses to shrink below its content without it, which is
    // what turns the scrolling pane into a growing panel.
    expect(read(BODY, 'minHeight')).toBe(0);
  });

  it('takes its corner and its edge from the kit rather than a copy of them', () => {
    expect(PANEL.borderRadius).toBe('var(--radius-xl)');
    expect(PANEL.borderColor).toBe(color('white/10'));
    expect(PANEL.borderStyle).toBe('solid');
    expect(PANEL.borderWidth).toBe(1);
  });

  it('paints on the theme’s ground, so a repainted theme repaints the panel', () => {
    expect(PANEL.backgroundColor).toMatch(/^var\(--kroma-/);
  });
});

describe('the header and footer rules', () => {
  it('separate with the same hairline on both sides of the body', () => {
    expect(read(HEADER_RULE, 'borderBottomWidth')).toBe(1);
    expect(read(FOOTER_RULE, 'borderTopWidth')).toBe(1);
    expect(read(HEADER_RULE, 'borderBottomColor')).toBe(read(FOOTER_RULE, 'borderTopColor'));
  });

  it('draw that hairline in a palette colour', () => {
    expect(read(HEADER_RULE, 'borderBottomColor')).toBe(color('white/7'));
  });
});
