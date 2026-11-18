// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { clipAsHidden, clipToHidden } from './clip-as-hidden';

const undo: Array<() => void> = [];

afterEach(() => {
  undo.splice(0).forEach((step) => step());
});

describe('clipToHidden', () => {
  it('spells overflow clip as hidden, on either axis', () => {
    expect(clipToHidden('.a{overflow:clip}')).toBe('.a{overflow:hidden}');
    expect(clipToHidden('.a{overflow-x: clip;color:red}')).toBe('.a{overflow-x: hidden;color:red}');
  });

  it('leaves a clip that is not an overflow alone', () => {
    expect(clipToHidden('.a{clip-path:none;text-overflow:ellipsis}')).toBe(
      '.a{clip-path:none;text-overflow:ellipsis}',
    );
  });
});

describe('clipAsHidden', () => {
  it('rewrites a rule inserted at runtime', () => {
    const style = document.createElement('style');
    document.head.appendChild(style);
    undo.push(clipAsHidden(), () => style.remove());

    style.sheet?.insertRule('.clamp{overflow:clip}', 0);

    expect(style.sheet?.cssRules[0]?.cssText).toBe('.clamp { overflow: hidden; }');
  });

  it('leaves alone a prototype that has no insertRule of its own', () => {
    const bare: CSSStyleSheet = Object.create(CSSStyleSheet.prototype);

    clipAsHidden(bare)();

    expect(Object.getOwnPropertyDescriptor(bare, 'insertRule')).toBeUndefined();
  });
});
