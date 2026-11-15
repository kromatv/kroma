import type { CropKeysOptions } from './crop-keys-types';
import { useResizableKeys } from './seam-keys.hook';

/** Hands a held crop frame the remote's four directions, and gives them back on Select or Back. */
export function useCropKeys({ held, onPan, onRelease }: CropKeysOptions): void {
  useResizableKeys({
    held,
    orientation: 'horizontal',
    onNudge: (towards) => onPan(towards, 0),
    onRelease,
  });
  useResizableKeys({
    held,
    orientation: 'vertical',
    onNudge: (towards) => onPan(0, towards),
    onRelease,
  });
}
