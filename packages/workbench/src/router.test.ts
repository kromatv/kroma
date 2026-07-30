// The routing port's pure parts; the adapters are covered by the kit site's
// integration test (`clients/kit/src/kit.test.tsx`).

import { describe, expect, it } from 'vitest';
import { memoryRouter, parseView, viewPath } from './router';

describe('parseView', () => {
  it('takes the two named views', () => {
    expect(parseView('preview')).toBe('preview');
    expect(parseView('matrix')).toBe('matrix');
  });

  it('takes a scene or a demo in either spelling', () => {
    expect(parseView('scene:1')).toBe('scene:1');
    expect(parseView('scene-1')).toBe('scene:1');
    expect(parseView('demo:0')).toBe('demo:0');
    expect(parseView('demo-0')).toBe('demo:0');
  });

  it('still takes the bare number a scene used to be', () => {
    expect(parseView('2')).toBe('scene:2');
  });

  it('refuses anything else rather than guessing', () => {
    expect(parseView(undefined)).toBeUndefined();
    expect(parseView('')).toBeUndefined();
    expect(parseView('scene')).toBeUndefined();
    expect(parseView('scene:x')).toBeUndefined();
    expect(parseView('../etc/passwd')).toBeUndefined();
  });
});

describe('viewPath', () => {
  it('spells a view for a path, and the default as nothing', () => {
    expect(viewPath('matrix')).toBe('matrix');
    expect(viewPath('scene:1')).toBe('scene-1');
    expect(viewPath('demo:0')).toBe('demo-0');
    // `preview` is spelled by being absent.
    expect(viewPath('preview')).toBeNull();
    expect(viewPath(undefined)).toBeNull();
  });

  it('round-trips every view it can spell', () => {
    for (const view of ['matrix', 'scene:0', 'scene:12', 'demo:3'] as const) {
      expect(parseView(viewPath(view))).toBe(view);
    }
  });
});

describe('memoryRouter', () => {
  it('is a hook, so a fresh adapter per render would remount its state', () => {
    expect(typeof memoryRouter()).toBe('function');
    expect(memoryRouter({ story: 'button' })).not.toBe(memoryRouter({ story: 'button' }));
  });
});
