import { describe, expect, it } from 'vitest';
import { atMedia, keyframes, rule, sheetCss } from './sheet';

describe('sheetCss', () => {
  it('writes a selector list one selector to a line, as it is read', () => {
    const css = sheetCss([rule(['*', '*::before'], { boxSizing: 'border-box' })]);

    expect(css).toBe('*,\n*::before {\n  box-sizing: border-box;\n}');
  });

  it('spells a property the way CSS does, vendor prefix included', () => {
    const css = sheetCss([
      rule('body', { WebkitFontSmoothing: 'antialiased', overflowX: 'hidden' }),
    ]);

    expect(css).toContain('-webkit-font-smoothing: antialiased;');
    expect(css).toContain('overflow-x: hidden;');
  });

  it('leaves a custom property exactly as it was named', () => {
    expect(sheetCss([rule(':root', { '--card-w': '13rem' })])).toContain('--card-w: 13rem;');
  });

  it('writes a number verbatim, so a unit is stated rather than guessed', () => {
    const css = sheetCss([rule('a', { zIndex: -1, opacity: 0.45, margin: 0, width: '10px' })]);

    expect(css).toContain('z-index: -1;');
    expect(css).toContain('opacity: 0.45;');
    expect(css).toContain('margin: 0;');
    expect(css).toContain('width: 10px;');
  });

  it('indents the rules an at-rule wraps', () => {
    const css = sheetCss([atMedia('(min-width: 600px)', [rule('.row', { display: 'grid' })])]);

    expect(css).toBe('@media (min-width: 600px) {\n  .row {\n    display: grid;\n  }\n}');
  });

  it('writes an animation from its steps, each step a rule of its own', () => {
    const css = sheetCss([
      keyframes('fade-in', [rule('from', { opacity: 0 }), rule(['50%', '100%'], { opacity: 1 })]),
    ]);

    expect(css).toContain('@keyframes fade-in {');
    expect(css).toContain('  from {\n    opacity: 0;\n  }');
    expect(css).toContain('  50%,\n  100% {\n    opacity: 1;\n  }');
  });

  it('separates two rules with a blank line and nothing else', () => {
    const css = sheetCss([rule('a', { color: 'red' }), rule('b', { color: 'blue' })]);

    expect(css).toBe('a {\n  color: red;\n}\n\nb {\n  color: blue;\n}');
  });
});
