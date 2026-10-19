import { useState } from 'react';
import type { StyleProp, TextInputContentSizeChangeEvent, TextStyle } from 'react-native';

/** A multiline input's height follows its content, clamped between `min` and `max`. */
export interface ContentHeight {
  style: StyleProp<TextStyle>;
  onContentSizeChange: ((e: TextInputContentSizeChangeEvent) => void) | undefined;
}

/** Measures the content the input reports and grows the field to it. */
export function useContentHeight(min: number, max: number): ContentHeight {
  const [content, setContent] = useState(0);
  return {
    style: { height: Math.min(Math.max(content, min), max) },
    onContentSizeChange: (e) => setContent(e.nativeEvent.contentSize.height),
  };
}
