import { describe, expect, it } from 'vitest';
import { type OutlineBox, ringDeclarations } from './outline-ring';

const PILL: OutlineBox = {
  outlineStyle: 'solid',
  outlineWidth: 4,
  outlineOffset: 6,
  outlineColor: 'rgb(244, 182, 66)',
  cornerRadii: ['22px', '22px', '22px', '22px'],
  borderWidths: [0, 0, 0, 0],
  hostsPseudo: true,
};

const declared = (box: OutlineBox): Record<string, string> =>
  Object.fromEntries(
    (ringDeclarations(box) ?? '').split(';').map((pair) => {
      const at = pair.indexOf(':');
      return [pair.slice(0, at), pair.slice(at + 1)];
    }),
  );

describe('ringDeclarations', () => {
  it('stands the ring off the control by its offset and width', () => {
    const ring = declared(PILL);

    expect([ring.top, ring.right, ring.bottom, ring.left]).toEqual([
      '-10px',
      '-10px',
      '-10px',
      '-10px',
    ]);
    expect(ring.border).toBe('4px solid rgb(244, 182, 66)');
  });

  it('rounds each corner concentric with the control', () => {
    const ring = declared({ ...PILL, cornerRadii: ['22px', '13px', '0px', '8px 4px'] });

    expect(ring['border-top-left-radius']).toBe('32px');
    expect(ring['border-top-right-radius']).toBe('23px');
    expect(ring['border-bottom-right-radius']).toBe('0px');
    expect(ring['border-bottom-left-radius']).toBe('18px 14px');
  });

  it('measures the offset from the outside of a bordered control', () => {
    const ring = declared({ ...PILL, borderWidths: [1, 2, 3, 4] });

    expect([ring.top, ring.right, ring.bottom, ring.left]).toEqual([
      '-11px',
      '-12px',
      '-13px',
      '-14px',
    ]);
  });

  it('draws a ring inside the control for a negative offset', () => {
    const ring = declared({
      ...PILL,
      outlineOffset: -10,
      cornerRadii: ['16px', '16px', '16px', '16px'],
    });

    expect(ring.top).toBe('6px');
    expect(ring['border-top-left-radius']).toBe('10px');
  });

  it('never turns a corner the ring moves inside of negative', () => {
    const ring = declared({
      ...PILL,
      outlineOffset: -10,
      cornerRadii: ['3px', '3px', '3px', '3px'],
    });

    expect(ring['border-top-left-radius']).toBe('0px');
  });

  it('keeps a percentage corner as the share of the ring it already is', () => {
    const ring = declared({ ...PILL, cornerRadii: ['50%', '50%', '50%', '50%'] });

    expect(ring['border-top-left-radius']).toBe('50%');
  });

  it('leaves a square control to the outline the engine draws', () => {
    expect(ringDeclarations({ ...PILL, cornerRadii: ['0px', '0px', '0px', '0px'] })).toBeNull();
  });

  it('leaves an element without a drawn outline alone', () => {
    expect(ringDeclarations({ ...PILL, outlineStyle: 'none' })).toBeNull();
    expect(ringDeclarations({ ...PILL, outlineWidth: 0 })).toBeNull();
    expect(ringDeclarations({ ...PILL, outlineStyle: 'auto' })).toBeNull();
  });

  it('keeps the outline where no pseudo-element can stand outside the control', () => {
    expect(ringDeclarations({ ...PILL, hostsPseudo: false })).toBeNull();
  });
});
