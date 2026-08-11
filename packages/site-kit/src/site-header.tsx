import type { ReactNode } from 'react';
import { Box, Row } from '#ui/components/atoms/box';
import { Divider } from '#ui/components/atoms/divider';
import { Logo } from '#ui/components/atoms/logo';
import { Text } from '#ui/components/atoms/text';
import { ThemeSwitch } from '#ui/components/molecules/theme-switch';

const EN = { system: 'Auto', light: 'Light', dark: 'Dark' };

/**
 * The site-wide header: the mark, this site's `title`, and a theme switch.
 * `actions` are placed to the left of that switch.
 */
export function SiteHeader({ title, actions }: Readonly<{ title: string; actions?: ReactNode }>) {
  return (
    <Box bg="surface1">
      <Box px={16} py={14}>
        <Row gap={14} between w="100%" maxW={1080} mx="auto">
          <Row gap={12} minW={0} shrink={1}>
            <Logo size={26} />
            <Box h={18} shrink={0}>
              <Divider vertical />
            </Box>
            <Text color="textMuted" variant="label" lines={1}>
              {title}
            </Text>
          </Row>
          <Row gap={10} shrink={0}>
            {actions}
            <ThemeSwitch label="Theme" labels={EN} />
          </Row>
        </Row>
      </Box>
      <Divider />
    </Box>
  );
}
