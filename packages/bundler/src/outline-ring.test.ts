// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { type OutlineBox, readOutlineBox, ringDeclarations } from './outline-ring';

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

function styled(tag: string, css: string): Element {
  const element = document.createElement(tag);
  element.setAttribute('style', css);
  document.body.appendChild(element);
  return element;
}

const RING_CSS =
  'outline-style:solid;outline-width:4px;outline-offset:6px;outline-color:rgb(244, 182, 66);' +
  'border-top-left-radius:22px;border-top-right-radius:13px;' +
  'border-bottom-right-radius:0px;border-bottom-left-radius:8px;' +
  'border-style:solid;border-width:2px;position:relative';

describe('readOutlineBox', () => {
  it('reads the outline, the four corners and the four borders from the computed style', () => {
    const element = styled('div', RING_CSS);

    const box = readOutlineBox(element, getComputedStyle(element));

    expect(box).toEqual({
      outlineStyle: 'solid',
      outlineWidth: 4,
      outlineOffset: 6,
      outlineColor: 'rgb(244, 182, 66)',
      cornerRadii: ['22px', '13px', '0px', '8px'],
      borderWidths: [2, 2, 2, 2],
      hostsPseudo: true,
    });
  });

  it.each([
    ['a replaced element', 'img', RING_CSS],
    ['a static element', 'div', `${RING_CSS};position:static`],
    [
      'an element that clips its overflow',
      'div',
      `${RING_CSS};overflow-x:hidden;overflow-y:hidden`,
    ],
  ])('cannot host a ring outside %s', (_name, tag, css) => {
    const element = styled(tag, css);

    const box = readOutlineBox(element, getComputedStyle(element));

    expect(box.hostsPseudo).toBe(false);
  });
});
