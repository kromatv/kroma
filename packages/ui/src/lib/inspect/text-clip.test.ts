import { describe, expect, it } from 'vitest';
import { textClip } from './text-clip';

const BOX = { width: 120, height: 40 };
const LINE = 20;

function measure(overflow: string, scroll: { width: number; height: number }) {
  return { overflowX: overflow, overflowY: overflow, scroll, client: BOX, lineHeight: LINE };
}

describe('what a box cuts off its text', () => {
  it('is how far one ellipsed line reaches past the box', () => {
    expect(textClip(measure('hidden', { width: 188, height: 40 }))).toEqual({
      width: 68,
      height: 0,
    });
  });

  it('is how far the lines a clamp drops reach below the box', () => {
    expect(textClip(measure('clip', { width: 120, height: 80 }))).toEqual({
      width: 0,
      height: 40,
    });
  });

  it('is nothing for a text that fits', () => {
    expect(textClip(measure('hidden', BOX))).toBeNull();
  });

  it('is nothing within a pixel of rounding across', () => {
    expect(textClip(measure('hidden', { width: 121, height: 40 }))).toBeNull();
  });

  it('is nothing for a font that reaches past a line box shorter than it', () => {
    expect(textClip(measure('hidden', { width: 120, height: 43 }))).toBeNull();
  });

  it('is a line the box drops, once it reaches past half of it', () => {
    expect(textClip(measure('hidden', { width: 120, height: 51 }))?.height).toBe(11);
  });

  it('is nothing for a box that lets its text spill over', () => {
    expect(textClip(measure('visible', { width: 300, height: 80 }))).toBeNull();
  });

  it('counts only the axis the box clips', () => {
    const spillsAcross = { ...measure('hidden', { width: 300, height: 80 }), overflowX: 'visible' };

    expect(textClip(spillsAcross)).toEqual({ width: 0, height: 40 });
  });

  it('is nothing for a box with no area to show a text in', () => {
    const collapsed = {
      ...measure('hidden', { width: 80, height: 20 }),
      client: { width: 0, height: 20 },
    };

    expect(textClip(collapsed)).toBeNull();
  });
});
