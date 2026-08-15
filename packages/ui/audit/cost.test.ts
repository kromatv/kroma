// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { costOf } from './cost';

function mount(html: string): readonly Element[] {
  document.body.innerHTML = html;
  return [...document.body.children];
}

const kinds = (html: string) => costOf(mount(html)).smells.map((smell) => smell.kind);

describe('costOf', () => {
  it('counts elements, and the leaves that are the content', () => {
    const cost = costOf(mount('<div><span>one</span><span>two</span></div>'));

    expect(cost.nodes).toBe(3);
    expect(cost.leaves).toBe(2);
    expect(cost.overhead).toBe(1);
    expect(cost.depth).toBe(2);
  });

  it('counts an svg as one element and its paths as glyph weight', () => {
    const cost = costOf(mount('<svg><path/><path/></svg>'));

    expect(cost.nodes).toBe(1);
    expect(cost.svg).toBe(2);
  });

  it('measures every root it is given, so a portal counts against its opener', () => {
    expect(costOf(mount('<div><span>a</span></div><div><span>b</span></div>')).nodes).toBe(4);
  });
});

describe('what it calls a smell', () => {
  it('reads a box with one child and nothing of its own as a passthrough', () => {
    expect(kinds('<div><div><span>text</span></div></div>')).toContain('passthrough');
  });

  it('leaves a box that paints alone', () => {
    expect(kinds('<div style="background-color: red"><span>text</span></div>')).toEqual([]);
    expect(kinds('<div style="border: 1px solid red"><span>t</span></div>')).toEqual([]);
    expect(kinds('<div style="opacity: 0.5"><span>t</span></div>')).toEqual([]);
    expect(kinds('<div style="transform: scale(1.1)"><span>t</span></div>')).toEqual([]);
    expect(kinds('<div style="position: absolute"><span>t</span></div>')).toEqual([]);
    expect(kinds('<div style="overflow: hidden"><span>t</span></div>')).toEqual([]);
  });

  it('leaves a box a screen reader can hear alone', () => {
    expect(kinds('<div role="group"><span>t</span></div>')).toEqual([]);
    expect(kinds('<div aria-label="Ports"><span>t</span></div>')).toEqual([]);
  });

  it('calls a box that only shapes its one child a wrapper, and says with what', () => {
    const smells = costOf(mount('<div style="padding: 8px"><span>t</span></div>')).smells;

    expect(smells[0]?.kind).toBe('wrapper');
    expect(smells[0]?.note).toContain('padding-top');
  });

  it('counts the gap between children as shaping, so a spaced row is a wrapper too', () => {
    const smells = costOf(
      mount('<div style="display: flex; row-gap: 8px; column-gap: 8px"><span>t</span></div>'),
    ).smells;

    expect(smells[0]?.kind).toBe('wrapper');
    expect(smells[0]?.note).toContain('row-gap');
    expect(smells[0]?.note).toContain('column-gap');
  });

  it('reads a box around one glyph as the glyph wrapper it is', () => {
    expect(kinds('<div style="padding: 4px"><svg><path/></svg></div>')).toEqual(['glyph-wrapper']);
  });

  it('reads a box that holds nothing and draws nothing as void', () => {
    expect(kinds('<div><div></div><span>t</span></div>')).toEqual(['void']);
  });

  it('leaves a spacer, whose whole job is its size', () => {
    expect(kinds('<div><div style="width: 24px"></div><span>t</span></div>')).toEqual([]);
  });

  it('reads a branch mounted invisible as its own finding', () => {
    expect(kinds('<div style="display: none"><span>t</span></div>')).toEqual(['hidden-subtree']);
    expect(kinds('<div style="opacity: 0"><span>t</span></div>')).toEqual(['hidden-subtree']);
  });

  it('names where it found one, so a component with twenty boxes is navigable', () => {
    const smells = costOf(mount('<div><i>x</i><div><span>t</span></div></div>')).smells;

    expect(smells[0]?.at).toBe('div > div:1');
  });
});
