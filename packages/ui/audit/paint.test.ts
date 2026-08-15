// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { signatureOf } from './paint';

function sign(html: string): readonly string[] {
  document.body.innerHTML = html;
  return signatureOf([...document.body.children]);
}

describe('signatureOf', () => {
  it('writes one line per content leaf', () => {
    expect(sign('<div><span>one</span><span>two</span></div>')).toHaveLength(2);
    expect(sign('<div><span>one</span><span>two</span></div>')[0]).toContain('"one"');
  });

  it('SURVIVES a collapsed wrapper: the padding a leaf sits inside is the sum', () => {
    const nested = sign('<div style="padding: 8px"><span style="padding: 4px">t</span></div>');
    const flat = sign('<span style="padding: 12px">t</span>');

    expect(nested).toEqual(flat);
  });

  it('survives a colour moving from a wrapper onto the leaf that needed it', () => {
    const nested = sign('<div style="color: red"><span>t</span></div>');
    const flat = sign('<span style="color: red">t</span>');

    expect(nested).toEqual(flat);
  });

  it('survives a single-child flex box being dropped', () => {
    const nested = sign('<div style="display: flex; flex-direction: row"><span>t</span></div>');

    expect(nested).toEqual(sign('<span>t</span>'));
  });

  it('CATCHES a lone child escaping the box that centres it', () => {
    const centred = sign(
      '<div style="display: flex; align-items: center; justify-content: center"><span>t</span></div>',
    );
    const pinned = sign(
      '<div style="display: flex; align-items: center; justify-content: center"><span style="align-self: flex-start">t</span></div>',
    );

    expect(centred[0]).toContain('flex=[');
    expect(pinned).not.toEqual(centred);
    expect(pinned[0]).toContain('self=[flex-start]');
  });

  it('CATCHES a flex box that was distributing children being dropped', () => {
    const row = sign(
      '<div style="display: flex; flex-direction: row; gap: 8px"><span>a</span><span>b</span></div>',
    );

    expect(row).not.toEqual(sign('<span>a</span><span>b</span>'));
    expect(row[0]).toContain('flex=[row');
  });

  it('CATCHES a padding, a radius, a shadow or a colour that went missing', () => {
    expect(sign('<span style="padding: 8px">t</span>')).not.toEqual(sign('<span>t</span>'));
    expect(sign('<span style="border-radius: 8px">t</span>')).not.toEqual(sign('<span>t</span>'));
    expect(sign('<span style="box-shadow: 0 1px 2px red">t</span>')).not.toEqual(
      sign('<span>t</span>'),
    );
    expect(sign('<span style="font-weight: 700">t</span>')).not.toEqual(sign('<span>t</span>'));
  });

  it('CATCHES an animation or a transform that stopped reaching a leaf', () => {
    expect(sign('<div style="transform: scale(2)"><span>t</span></div>')).not.toEqual(
      sign('<span>t</span>'),
    );
    expect(sign('<div style="transition: opacity 200ms"><span>t</span></div>')[0]).toContain(
      'anim=[opacity',
    );
  });

  it('multiplies opacity down the chain, so a fade cannot be lost halfway', () => {
    expect(
      sign('<div style="opacity: 0.5"><span style="opacity: 0.5">t</span></div>')[0],
    ).toContain('op=0.250');
  });

  it('records a glyph by what it draws', () => {
    expect(sign('<svg width="16" stroke="red"><path/></svg>')[0]).toContain('width=16 height=');
    expect(sign('<svg width="16" stroke="red"><path/></svg>')[0]).toContain('stroke=red');
  });

  it('names a time as a time, whatever the clock says', () => {
    expect(sign('<span>ends at 7:20 PM</span>')).toEqual(sign('<span>ends at 11:05 AM</span>'));
  });
});
