import { describe, expect, it } from 'vitest';
import { RuleSheet } from './sheet.ts';

describe('RuleSheet', () => {
  it('writes each rule once, lower groups first, then by text', () => {
    const sheet = new RuleSheet();
    sheet.add([
      { group: 3, css: '.b{top:0;}' },
      { group: 2, css: '.z{margin:0;}' },
      { group: 3, css: '.a{left:0;}' },
    ]);
    sheet.add([{ group: 3, css: '.b{top:0;}' }]);

    expect(sheet.size).toBe(3);
    expect(sheet.entries()).toEqual([
      [2, '.z{margin:0;}'],
      [3, '.a{left:0;}'],
      [3, '.b{top:0;}'],
    ]);
    expect(sheet.toCss()).toBe('.z{margin:0;}\n.a{left:0;}\n.b{top:0;}');
  });
});
