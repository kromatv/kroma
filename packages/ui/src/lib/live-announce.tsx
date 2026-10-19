import { useEffect } from 'react';
import { AccessibilityInfo } from 'react-native';

/** Says `text` to a screen reader each time it changes, and nothing while it is empty. */
export function LiveAnnounce({ text }: Readonly<{ text: string }>) {
  useEffect(() => {
    if (text === '') return;
    AccessibilityInfo.announceForAccessibility(text);
  }, [text]);
  return null;
}
