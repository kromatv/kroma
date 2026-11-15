/**
 * What a held crop frame does with the keys it owns. `onPan` takes one step per
 * axis, `-1` towards the left or the top; `onZoom` takes `1` for closer and only
 * a keyboard has the keys for it; `onRelease` answers Select, Escape or Back.
 */
export interface CropKeysOptions {
  held: boolean;
  onPan: (x: -1 | 0 | 1, y: -1 | 0 | 1) => void;
  onZoom: (towards: -1 | 1) => void;
  onRelease: () => void;
}
