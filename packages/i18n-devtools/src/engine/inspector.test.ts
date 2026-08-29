import { describe, expect, it } from 'vitest';
import type { Outline } from '../live';
import { markIn } from '../overlay/mark';
import { inspectorFor } from './inspector';

const FR = { scope: null, locale: 'fr' };

function inspecting(keys: boolean, outline: Outline) {
  const inspector = inspectorFor(keys, outline);
  if (!inspector) throw new Error('these switches ask for an inspector');
  return inspector;
}

function rendered(text: string, from: typeof FR | undefined = FR) {
  return { key: 'auth.login', from, locale: 'fr', text, vars: undefined, holes: [] };
}

describe('the installed inspector', () => {
  it('asks for no inspector at all while both switches are off', () => {
    expect(inspectorFor(false, 'off')).toBeNull();
  });

  it('draws the key and the catalog that answered for the key switch', () => {
    expect(inspecting(true, 'off')(rendered('Connexion'))).toBe('[core/auth.login]');
  });

  it('leaves the text alone but for its mark when only the outline is on', () => {
    const text = inspecting(false, 'problems')(rendered('Connexion'));

    expect(text).toContain('Connexion');
    expect(markIn(text)).toBe('catalog');
  });

  it('marks the key it drew when both are on', () => {
    const text = inspecting(
      true,
      'problems',
    )({
      key: 'auth.login',
      from: undefined,
      locale: 'fr',
      text: 'auth.login',
      vars: undefined,
      holes: [],
    });

    expect(text).toContain('[missing/auth.login]');
    expect(markIn(text)).toBe('missing');
  });

  it('keeps one identity per state, because a new one re-renders every string', () => {
    expect(inspectorFor(true, 'off')).toBe(inspectorFor(true, 'off'));
    expect(inspectorFor(true, 'off')).not.toBe(inspectorFor(true, 'problems'));
  });
});
