import { describe, expect, it } from 'vitest';
import { safeImageUrl } from './safe-image-url';

describe('safeImageUrl', () => {
  it('passes our own artwork paths through untouched', () => {
    expect(safeImageUrl('/api/images/abc?w=200')).toBe('/api/images/abc?w=200');
    expect(safeImageUrl('poster.jpg')).toBe('poster.jpg');
    expect(safeImageUrl('//cdn.example.com/a.jpg')).toBe('//cdn.example.com/a.jpg');
  });

  it('allows the schemes that only ever paint', () => {
    expect(safeImageUrl('https://image.tmdb.org/t/p/w780/x.jpg')).toBe(
      'https://image.tmdb.org/t/p/w780/x.jpg',
    );
    expect(safeImageUrl('http://nas.local/a.png')).toBe('http://nas.local/a.png');
    expect(safeImageUrl('blob:https://app/9f')).toBe('blob:https://app/9f');
    expect(safeImageUrl('data:image/png;base64,iVBOR')).toBe('data:image/png;base64,iVBOR');
  });

  it('rejects a scheme that navigates or executes', () => {
    expect(safeImageUrl('javascript:alert(1)')).toBeNull();
    // Case and leading whitespace must not sneak one past the check.
    expect(safeImageUrl('  JaVaScRiPt:alert(1)')).toBeNull();
    // data: is narrowed to images - data:text/html is a payload, not artwork.
    expect(safeImageUrl('data:text/html,<script>alert(1)</script>')).toBeNull();
    expect(safeImageUrl('vbscript:msgbox')).toBeNull();
  });

  it('rejects a scheme smuggled past the check with a tab or a newline', () => {
    // A browser deletes tab/CR/LF from anywhere in a URL before parsing it, so
    // every one of these loads as `javascript:alert(1)`. Splitting the scheme
    // used to walk straight through the "no scheme at all" branch.
    expect(safeImageUrl('java\nscript:alert(1)')).toBeNull();
    expect(safeImageUrl('java\tscript:alert(1)')).toBeNull();
    expect(safeImageUrl('jav\rascript:alert(1)')).toBeNull();
    expect(safeImageUrl('data:text/ht\nml,<script>alert(1)</script>')).toBeNull();
  });

  it('keeps stripping to the scheme check, leaving a real path usable', () => {
    // The strip must not corrupt artwork that merely got wrapped in transit.
    expect(safeImageUrl('/api/images/\nabc')).toBe('/api/images/abc');
    expect(safeImageUrl('\n')).toBeNull();
  });

  it('reads the scheme only up to the first delimiter', () => {
    expect(safeImageUrl('/api/images/abc?to=10:30')).toBe('/api/images/abc?to=10:30');
    expect(safeImageUrl('?season=1:2')).toBe('?season=1:2');
    expect(safeImageUrl('C:/Users/art.jpg')).toBeNull();
    expect(safeImageUrl('custom:poster.jpg')).toBeNull();
  });

  it('treats absent artwork as absent', () => {
    expect(safeImageUrl(null)).toBeNull();
    expect(safeImageUrl(undefined)).toBeNull();
    expect(safeImageUrl('')).toBeNull();
  });
});
