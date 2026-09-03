import { describe, expect, it } from 'vitest';
import { queryString } from '../../core/http';
import { streamQuery } from './client';

const encoded = (declaration: Parameters<typeof streamQuery>[0]) =>
  queryString(streamQuery(declaration));

describe('streamQuery', () => {
  it('declares nothing for a device that declared nothing', () => {
    expect(encoded({})).toBe('');
  });

  it('keeps "decode none" distinct from "no preference"', () => {
    expect(encoded({ copyCodecs: [] })).toBe('?copy=');
    expect(encoded({ copyCodecs: undefined })).toBe('');
  });

  it('joins a codec list the way the server reads it', () => {
    expect(encoded({ copyCodecs: ['aac', 'eac3'], videoCodecs: ['h264'] })).toBe(
      '?copy=aac%2Ceac3&video=h264',
    );
  });

  it('rounds a picture ceiling, and sends none when the device never probed one', () => {
    expect(encoded({ maxFrame: { width: 1920.4, height: 1080.6 } })).toBe('?maxw=1920&maxh=1081');
    expect(encoded({ maxFrame: { width: 0, height: 0 } })).toBe('');
  });
});
