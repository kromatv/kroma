import { createKromaClient } from '@kroma/client';
import { ItemId, MediaItem } from '@kroma/client/media';
import { describe, expect, expectTypeOf, it } from 'vitest';

describe('a domain subpath', () => {
  it('resolves under the package name and carries the domain schemas', () => {
    expect(ItemId.parse('tt0111161')).toBe('tt0111161');
    expect(MediaItem).toBeDefined();
  });

  it('puts the domain on the client the augmentation declares', () => {
    const client = createKromaClient({ baseUrl: 'http://kroma.test' });

    expectTypeOf<ItemId>().toExtend<string>();
    expect(client.media.item).toBeTypeOf('function');
  });
});
