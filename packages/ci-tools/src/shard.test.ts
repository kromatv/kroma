import { describe, expect, it } from 'vitest';
import { blobName, expectedBlobs, parseShard } from './shard';

describe('parseShard', () => {
  it('reads a one-based index over a total', () => {
    expect(parseShard('2/4')).toEqual({ index: 2, total: 4 });
  });

  it('rejects a malformed or out-of-range shard', () => {
    expect(() => parseShard('2')).toThrow(/<index>\/<total>/);
    expect(() => parseShard('0/4')).toThrow(/out of range/);
    expect(() => parseShard('5/4')).toThrow(/out of range/);
    expect(() => parseShard('1/0')).toThrow(/out of range/);
  });
});

describe('expectedBlobs', () => {
  it('names every report a run of shards leaves behind', () => {
    expect(expectedBlobs(3)).toEqual(['blob-1-3.json', 'blob-2-3.json', 'blob-3-3.json']);
    expect(blobName({ index: 2, total: 3 })).toBe('blob-2-3.json');
  });
});
