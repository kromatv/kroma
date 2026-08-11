import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { color, radius } from '@kroma/ui/kit';
import { describe, expect, it } from 'vitest';
import { FOOTER_RULE, HEADER_RULE, MODAL_BODY, MODAL_LAYER, modalPanel } from './modal-shell';

const PANEL = modalPanel(768);

// The scrim these panels float over is a stylesheet rule (`.modal-scrim`), so
// the one number that pairs them lives on the other side of the app.
const SCRIM_Z = Number(
  /\.modal-scrim\s*\{[^}]*z-index:\s*(\d+)/.exec(
    readFileSync(fileURLToPath(new URL('../../styles.css', import.meta.url)), 'utf8'),
  )?.[1],
);

describe('the modal layer', () => {
  it('covers the window rather than a place in the page', () => {
    expect(MODAL_LAYER.position).toBe('fixed');
    expect(MODAL_LAYER.inset).toBe(0);
  });

  it('floats above the scrim it shares the page with', () => {
    expect(SCRIM_Z).toBeGreaterThan(0);
    expect(MODAL_LAYER.zIndex).toBeGreaterThan(SCRIM_Z);
  });

  it('centres whatever it holds', () => {
    expect(MODAL_LAYER.display).toBe('flex');
    expect(MODAL_LAYER.alignItems).toBe('center');
    expect(MODAL_LAYER.justifyContent).toBe('center');
  });

  it('lets the page through everywhere the panel is not', () => {
    expect(MODAL_LAYER.pointerEvents).toBe('none');
    expect(PANEL.pointerEvents).toBe('auto');
  });
});

describe('the modal panel', () => {
  it('fills the width up to the cap its caller states', () => {
    expect(PANEL.width).toBe('100%');
    expect(modalPanel(512).maxWidth).toBe(512);
    expect(modalPanel(1024).maxWidth).toBe(1024);
  });

  it('never grows past the window it floats in', () => {
    expect(PANEL.maxHeight).toBe('88vh');
  });

  it('clips itself and scrolls its body, so the header and footer stay put', () => {
    expect(PANEL.overflow).toBe('hidden');
    expect(PANEL.display).toBe('flex');
    expect(PANEL.flexDirection).toBe('column');
    expect(MODAL_BODY.flex).toBe(1);
    expect(MODAL_BODY.overflowY).toBe('auto');
    // A flex child refuses to shrink below its content without it, which is
    // what turns the scrolling pane into a growing panel.
    expect(MODAL_BODY.minHeight).toBe(0);
  });

  it('takes its corner and its edge from the kit rather than a copy of them', () => {
    expect(PANEL.borderRadius).toBe(radius['2xl']);
    expect(PANEL.borderColor).toBe(color('white/10'));
    expect(PANEL.borderStyle).toBe('solid');
    expect(PANEL.borderWidth).toBe(1);
  });

  it('paints on the theme’s ground, so a repainted theme repaints the panel', () => {
    expect(PANEL.background).toMatch(/^var\(--kroma-/);
  });

  it('casts its shadow in a palette colour', () => {
    expect(PANEL.boxShadow).toContain(color('black/60'));
  });
});

describe('the header and footer rules', () => {
  it('separate with the same hairline on both sides of the body', () => {
    expect(HEADER_RULE.borderBottomWidth).toBe(1);
    expect(FOOTER_RULE.borderTopWidth).toBe(1);
    expect(HEADER_RULE.borderBottomColor).toBe(FOOTER_RULE.borderTopColor);
  });

  it('draw that hairline in a palette colour', () => {
    expect(HEADER_RULE.borderBottomColor).toBe(color('white/7'));
  });
});
