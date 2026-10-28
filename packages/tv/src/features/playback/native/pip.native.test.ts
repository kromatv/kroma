import { beforeEach, describe, expect, it, vi } from 'vitest';

const expo = vi.hoisted(() => ({ supported: true }));
vi.mock('expo-video', () => ({ isPictureInPictureSupported: () => expo.supported }));

import { nativePictureInPicture } from './pip';

beforeEach(() => {
  expo.supported = true;
});

describe('picture-in-picture on the native shells', () => {
  it('is offered on the expo-video surface of a set that supports it', () => {
    expect(nativePictureInPicture('video')).toBe(true);
  });

  it('is not offered on the VLC plane', () => {
    expect(nativePictureInPicture('vlc')).toBe(false);
  });

  it('is not offered where the system refuses it', () => {
    expo.supported = false;

    expect(nativePictureInPicture('video')).toBe(false);
  });
});
