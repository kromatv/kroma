import type { StyleProp, TextInputContentSizeChangeEvent, TextStyle } from 'react-native';
import { style } from '#ui/core';
import { fieldSizing } from './css';

/** A multiline input's height follows its content, clamped between `min` and `max`. */
export interface ContentHeight {
  style: StyleProp<TextStyle>;
  onContentSizeChange: ((e: TextInputContentSizeChangeEvent) => void) | undefined;
}

const SIZED = style(fieldSizing());

/** Lets the browser size the field to its content: no per-keystroke state. */
export function useContentHeight(_min: number, _max: number): ContentHeight {
  return { style: SIZED, onContentSizeChange: undefined };
}
