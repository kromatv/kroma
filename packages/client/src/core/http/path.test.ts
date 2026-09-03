import { describe, expect, expectTypeOf, it } from 'vitest';
import { buildPath, type PathParam } from './path';

describe('path templates', () => {
  it('reads the parameter names off the template', () => {
    expectTypeOf<PathParam<'/items/:id'>>().toEqualTypeOf<'id'>();
    expectTypeOf<PathParam<'/rematch/:kind/:id/candidates'>>().toEqualTypeOf<'kind' | 'id'>();
    expectTypeOf<PathParam<'/items/:id/subtitles/:index.vtt'>>().toEqualTypeOf<'id' | 'index'>();
    expectTypeOf<PathParam<'/health'>>().toEqualTypeOf<never>();
  });

  it('fills every parameter, encoding what would otherwise reshape the URL', () => {
    expect(buildPath('/items/:id/stream', { id: 'a b/c' })).toBe('/items/a%20b%2Fc/stream');
    expect(buildPath('/items/:id/subtitles/:index.vtt', { id: 'i1', index: 3 })).toBe(
      '/items/i1/subtitles/3.vtt',
    );
  });

  it('leaves a template with no parameters alone', () => {
    expect(buildPath('/health')).toBe('/health');
  });

  it('refuses to build a path with a parameter it was given no value for', () => {
    expect(() => buildPath('/items/:id', {})).toThrow('/items/:id has no value for :id');
  });
});
