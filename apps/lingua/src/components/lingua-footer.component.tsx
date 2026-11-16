import { SiteFooterBar } from '@kromatv/site-kit/site-footer-bar';
import { site } from '@kromatv/site-meta';
import { Box, Row } from '@kromatv/ui/kit/atoms/box';
import { Text } from '@kromatv/ui/kit/atoms/text';
import { ThemeSwitch } from '@kromatv/ui/kit/molecules/theme-switch';
import { useThemeMode } from '#site/lib/use-theme-mode.hook';

const THEME_LABELS = { system: 'Auto', light: 'Light', dark: 'Dark' };

const LINKS = [
  { label: 'Source code', href: site.repo },
  { label: 'Running Lingua', href: `${site.repo}/blob/main/apps/lingua/README.md` },
  { label: 'Privacy', href: site.links.privacy },
  { label: 'KROMA', href: site.url },
];

/** Lingua's footer: the theme, then one line of links, as a tool's should be. */
export function LinguaFooter() {
  const { mode } = useThemeMode();
  return (
    <Box>
      <Box px={16} pt={8} pb={16}>
        <Row gap={12} align="center" w="100%" maxW={1080} mx="auto">
          <Text variant="meta" color="textDim">
            Theme
          </Text>
          <ThemeSwitch key={mode} label="Theme" labels={THEME_LABELS} />
        </Row>
      </Box>
      <SiteFooterBar links={LINKS} />
    </Box>
  );
}
