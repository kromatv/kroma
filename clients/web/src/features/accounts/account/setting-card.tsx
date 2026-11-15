import {
  Box,
  type IconName,
  IconWell,
  Surface,
  styles,
  Text,
  useStyles,
  typeSpec as textRoles,
} from '@kromatv/ui/kit';
import type { ReactNode } from 'react';

const sDefinition = styles({
  footer: { bg: 'tint/3', borderTopWidth: 1, borderTopColor: 'border' },
  title: { fontSize: textRoles.body.size, fontWeight: '700' },
});

/** One setting on the account page: what it is and what it does, the controls
 * for it, and a footer for the hint and the action that commits it. */
export function SettingCard({
  icon,
  title,
  description,
  aside,
  footer,
  children,
}: Readonly<{
  icon: IconName;
  title: string;
  description?: string;
  /** Sits beside the title: the action that opens the setting, or its state. */
  aside?: ReactNode;
  /** A quiet bar under the controls, for the hint and the save action. */
  footer?: ReactNode;
  children?: ReactNode;
}>) {
  const s = useStyles(sDefinition);
  return (
    <Surface elevated pad="none" radius="xl" border="border" overflow="hidden">
      <Box p={{ base: 18, md: 24 }} gap={20}>
        <Box row wrap between align="center" gap={16}>
          <Box row flex minW={220} align="center" gap={14}>
            <IconWell name={icon} size="sm" tone="accent" />
            <Box flex minW={0}>
              <Text variant="label" style={s.title}>
                {title}
              </Text>
              {description ? (
                <Text variant="meta" color="textMuted" mt={2}>
                  {description}
                </Text>
              ) : null}
            </Box>
          </Box>
          {aside}
        </Box>
        {children}
      </Box>
      {footer ? (
        <Box
          row
          wrap
          between
          align="center"
          gap={12}
          px={{ base: 18, md: 24 }}
          py={14}
          style={s.footer}
        >
          {footer}
        </Box>
      ) : null}
    </Surface>
  );
}
