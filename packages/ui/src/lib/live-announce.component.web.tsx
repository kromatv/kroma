import { StyleSheet, Text, View } from 'react-native';

/** Says `text` to a screen reader each time it changes, and nothing while it is empty. */
export function LiveAnnounce({ text }: Readonly<{ text: string }>) {
  return (
    <View accessibilityLiveRegion="polite" style={s.unseen}>
      <Text>{text}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  unseen: {
    position: 'absolute',
    width: 1,
    height: 1,
    overflow: 'hidden',
    opacity: 0,
    pointerEvents: 'none',
  },
});
