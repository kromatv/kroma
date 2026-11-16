import { site } from '@kromatv/site-meta';
import { Box, Row } from '@kromatv/ui/kit/atoms/box';
import { Button } from '@kromatv/ui/kit/atoms/button';
import { Divider } from '@kromatv/ui/kit/atoms/divider';
import { Text } from '@kromatv/ui/kit/atoms/text';
import type { FooterLink } from './site-footer.component';

/**
 * The one-line footer of a KROMA tool, where the marketing footer would be too
 * much: the copyright and licence on one side, `links` on the other.
 */
export function SiteFooterBar({ links }: Readonly<{ links: readonly FooterLink[] }>) {
  return (
    <Box role="contentinfo">
      <Divider />
      <Box px={16} py={12}>
        <Row gap={12} wrap between align="center" w="100%" maxW={1080} mx="auto">
          <Text variant="meta" color="textDim">
            {`© 2026 KROMA · ${site.license}`}
          </Text>
          <Row gap={2} wrap>
            {links.map((link) => (
              <Button
                key={link.label}
                variant="ghost"
                size="sm"
                role="link"
                href={link.href}
                label={link.label}
              />
            ))}
          </Row>
        </Row>
      </Box>
    </Box>
  );
}
