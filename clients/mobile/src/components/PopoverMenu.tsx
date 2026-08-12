// Anchored popover menu (iOS-menu style): an elevated card that springs open
// from the trigger's position, with a press-through backdrop. Pure RN Animated,
// reusable for any small option list (seasons, sort, ...).

import { Box, Icon, styles, Text } from '@kroma/ui/kit';
import { useEffect, useRef } from 'react';
import { Animated, Modal, Pressable, ScrollView, useWindowDimensions } from 'react-native';
import { radius, spacing, type } from '#mobile/lib/theme';

export interface PopoverAnchor {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PopoverItem {
  key: string;
  label: string;
  detail?: string;
  active?: boolean;
  onPress(): void;
}

const MENU_WIDTH = 250;

export function PopoverMenu({
  visible,
  anchor,
  items,
  onClose,
}: Readonly<{
  visible: boolean;
  anchor: PopoverAnchor | null;
  items: PopoverItem[];
  onClose(): void;
}>) {
  const { width: screenW, height: screenH } = useWindowDimensions();
  const scale = useRef(new Animated.Value(0.85)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      scale.setValue(0.85);
      opacity.setValue(0);
      Animated.parallel([
        Animated.spring(scale, {
          toValue: 1,
          useNativeDriver: true,
          stiffness: 320,
          damping: 24,
          mass: 0.8,
        }),
        Animated.timing(opacity, { toValue: 1, duration: 120, useNativeDriver: true }),
      ]).start();
    }
  }, [visible, scale, opacity]);

  if (!anchor) return null;
  const left = Math.max(spacing.md, Math.min(anchor.x, screenW - MENU_WIDTH - spacing.md));
  const below = anchor.y + anchor.height + 8;
  const maxHeight = Math.min(items.length * 50 + 16, screenH * 0.5);
  const top = below + maxHeight > screenH - 40 ? Math.max(40, anchor.y - maxHeight - 8) : below;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose} />
      <Animated.View
        style={[
          s.menu,
          {
            left,
            top,
            maxHeight,
            opacity,
            transform: [{ scale }],
          },
        ]}
      >
        <ScrollView showsVerticalScrollIndicator={false}>
          {items.map((item) => (
            <Pressable
              key={item.key}
              onPress={() => {
                item.onPress();
                onClose();
              }}
              style={({ pressed }) => [s.row, pressed && s.rowPressed]}
            >
              <Text style={[s.label, item.active && s.labelActive]}>{item.label}</Text>
              <Box style={s.right}>
                {item.detail ? <Text style={s.detail}>{item.detail}</Text> : null}
                {item.active ? (
                  <Icon name="check" size={16} thickness={2.4} color="accentText" />
                ) : null}
              </Box>
            </Pressable>
          ))}
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}

const s = styles({
  backdrop: { flex: true, bg: 'black/25' },
  menu: {
    absolute: true,
    w: MENU_WIDTH,
    px: 6,
    py: 6,
    bg: 'surface2',
    radius: radius.lg,
    transformOrigin: 'top left',
    shadowColor: 'black',
    shadowOpacity: 0.45,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 12,
  },
  row: {
    row: true,
    between: true,
    align: 'center',
    gap: spacing.sm,
    minH: 46,
    px: spacing.sm,
    radius: radius.sm,
  },
  rowPressed: { bg: 'surface3' },
  label: { ...type.body, color: 'text' },
  labelActive: { fontWeight: '800', color: 'accentText' },
  right: { row: true, align: 'center', gap: 8 },
  detail: { ...type.small },
});
