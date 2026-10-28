import { isPictureInPictureSupported } from 'expo-video';
import type { Surface } from '#tv/features/playback/player/engine';

/** Only expo-video's view hands its picture to the system window; the VLC plane
 * has no picture-in-picture, and neither does a set whose OS refuses it. */
export function nativePictureInPicture(surface: Surface): boolean {
  return surface === 'video' && isPictureInPictureSupported();
}
