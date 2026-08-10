import { StyleSheet, type ViewStyle } from 'react-native';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { splitBoxLayers } from './box-layers';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('splitBoxLayers', () => {
  it('sends the props the parent lays out to the box and the rest to the face', () => {
    const { box, face } = splitBoxLayers({
      height: 52,
      flex: 1,
      backgroundColor: 'rgba(255, 255, 255, 0.05)',
      borderRadius: 16,
      alignItems: 'center',
    });
    expect(box).toEqual({ height: 52, flex: 1 });
    expect(StyleSheet.flatten(face)).toEqual({
      backgroundColor: 'rgba(255, 255, 255, 0.05)',
      borderRadius: 16,
      alignItems: 'center',
      // flexGrow, not flex: it must not zero the basis of a self-sizing control.
      flexGrow: 1,
    });
  });

  it('leaves a pure paint style whole, with no box', () => {
    const style = { backgroundColor: 'red', borderRadius: 8 };
    const layers = splitBoxLayers(style);
    expect(layers.box).toBeUndefined();
    expect(layers.face).toBe(style);
  });

  it('handles no style at all', () => {
    expect(splitBoxLayers(undefined)).toEqual({ face: undefined });
  });

  it('hands the style straight back where flatten reports nothing', () => {
    vi.spyOn(StyleSheet, 'flatten').mockReturnValue(undefined as unknown as ViewStyle);
    expect(splitBoxLayers({ flex: 1 })).toEqual({ face: { flex: 1 } });
  });

  it('flattens an array before splitting, last value winning', () => {
    const { box, face } = splitBoxLayers([{ flex: 1, padding: 4 }, { flex: 2 }]);
    expect(box).toEqual({ flex: 2 });
    expect(StyleSheet.flatten(face)).toEqual({ padding: 4, flexGrow: 1 });
  });
});
