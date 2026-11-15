import { describe, expect, it } from 'vitest';
import { CROP_IDENTITY } from './crop-geometry';
import { cropImage } from './crop-image';

describe('cropImage on a platform with no canvas', () => {
  it('answers null, whatever it is asked for', async () => {
    const crop = { src: 'file:///photo.jpg', transform: CROP_IDENTITY, aspect: 1 };

    expect(await cropImage(crop)).toBeNull();
    expect(await cropImage(crop, { width: 512, height: 512 })).toBeNull();
  });
});
