import { useEffect } from 'react';
import { AccessibilityInfo } from 'react-native';
import { Box } from '#ui/components/atoms/box';
import { Text } from '#ui/components/atoms/text';
import { styles, useStyles } from '#ui/core';
import { WEB } from '#ui/lib/platform';

/** Says `text` to a screen reader each time it changes, and nothing while it
 *  is empty. A browser hears it through a polite live region that stays
 *  mounted while the bar comes and goes, since a region mounted with its first
 *  words never speaks them; a native reader is handed it directly. */
export function Announce({ text }: Readonly<{ text: string }>) {
  const s = useStyles(sDefinition);
  useEffect(() => {
    if (WEB || text === '') return;
    AccessibilityInfo.announceForAccessibility(text);
  }, [text]);
  if (!WEB) return null;
  return (
    <Box accessibilityLiveRegion="polite" style={s.unseen}>
      <Text>{text}</Text>
    </Box>
  );
}

const sDefinition = styles({
  unseen: {
    absolute: true,
    w: 1,
    h: 1,
    overflow: 'hidden',
    opacity: 0,
    pointerEvents: 'none',
  },
});
