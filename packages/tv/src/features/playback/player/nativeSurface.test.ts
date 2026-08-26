// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { revealNativeSurface } from './nativeSurface';

afterEach(() => {
  document.documentElement.style.background = '';
  document.body.style.background = '';
  document.getElementById('root')?.remove();
});

function root(): HTMLElement {
  const el = document.createElement('div');
  el.id = 'root';
  document.body.append(el);
  return el;
}

describe('revealNativeSurface', () => {
  it('clears the whole chain the shell paints its ground on', () => {
    document.documentElement.style.background = 'rgb(10, 10, 12)';
    document.body.style.background = 'rgb(10, 10, 12)';
    const mounted = root();
    mounted.style.background = 'rgb(0, 0, 0)';

    revealNativeSurface();

    expect(document.documentElement.style.background).toBe('transparent');
    expect(document.body.style.background).toBe('transparent');
    expect(mounted.style.background).toBe('transparent');
  });

  it('puts back exactly what each element carried', () => {
    document.documentElement.style.background = 'rgb(10, 10, 12)';
    document.body.style.background = '';
    const mounted = root();
    mounted.style.background = 'rgb(0, 0, 0)';

    revealNativeSurface()();

    expect(document.documentElement.style.background).toBe('rgb(10, 10, 12)');
    expect(document.body.style.background).toBe('');
    expect(mounted.style.background).toBe('rgb(0, 0, 0)');
  });

  // The player mounts before its stage on some shells, so the chain is read as
  // it is rather than assumed complete.
  it('skips a link in the chain that is not mounted', () => {
    expect(document.getElementById('root')).toBeNull();

    const undo = revealNativeSurface();

    expect(document.body.style.background).toBe('transparent');
    expect(() => undo()).not.toThrow();
  });
});
