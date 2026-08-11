import { site } from '@kroma/site-meta';
import { Box, Column, Row } from '#ui/components/atoms/box';
import { Button } from '#ui/components/atoms/button';
import { Divider } from '#ui/components/atoms/divider';
import { Logo } from '#ui/components/atoms/logo';
import { Text } from '#ui/components/atoms/text';

/** One entry of a footer column. */
export interface FooterLink {
  label: string;
  href: string;
}

/** A titled group of footer links. */
export interface FooterColumn {
  title: string;
  links: readonly FooterLink[];
}

/** The address a deployment serves, under the name its audience knows it by. */
export interface FooterUrl {
  label: string;
  value: string;
}

/**
 * The three link columns a KROMA site footer carries. `sibling` is the property
 * this site points at in place of itself; `guide` is the documentation entry it
 * lists between the source code and the install guide.
 */
export function footerColumns({
  sibling,
  guide,
}: Readonly<{ sibling: FooterLink; guide: FooterLink }>): FooterColumn[] {
  return [
    {
      title: 'KROMA',
      links: [
        { label: 'Website', href: site.url },
        { label: 'TV demo', href: site.tvUrl },
        { label: 'UI kit', href: site.uiUrl },
        sibling,
      ],
    },
    {
      title: 'Resources',
      links: [
        { label: 'Source code', href: site.repo },
        guide,
        { label: 'Install guide', href: site.links.installGuide },
      ],
    },
    {
      title: 'Legal',
      links: [
        { label: 'Privacy', href: site.links.privacy },
        { label: 'Support', href: site.links.support },
        { label: `${site.license} license`, href: site.links.license },
      ],
    },
  ];
}

function LinkColumn({ title, links }: Readonly<FooterColumn>) {
  return (
    <Column gap={8} grow={1} shrink={1} basis={160} minW={140}>
      <Box pl={16}>
        <Text variant="overline" color="textDim">
          {title}
        </Text>
      </Box>
      <Column gap={2} align="flex-start">
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
      </Column>
    </Column>
  );
}

/**
 * The site-wide footer. `blurb` describes this deployment in one line and `url`
 * is the address it serves, under the label its audience knows it by.
 */
export function SiteFooter({
  blurb,
  columns,
  url,
}: Readonly<{ blurb: string; columns: readonly FooterColumn[]; url: FooterUrl }>) {
  return (
    <Box bg="surface1" role="contentinfo">
      <Divider />
      <Box px={28} py={48}>
        <Column gap={36} w="100%" maxW={1080} mx="auto">
          <Row gap={36} wrap align="flex-start">
            <Column gap={16} grow={1} shrink={1} basis={300} minW={220} maxW={380}>
              <Logo size={26} />
              <Text color="textMuted" variant="meta">
                {blurb}
              </Text>
              <Column gap={4}>
                <Text variant="overline" color="textDim">
                  {url.label}
                </Text>
                <Text variant="meta" font="mono" color="textMuted" lines={1}>
                  {url.value}
                </Text>
              </Column>
              <Row gap={8} wrap>
                <Button
                  variant="glass"
                  size="sm"
                  icon="brand-github"
                  role="link"
                  href={site.repo}
                  label="Star on GitHub"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  icon="mail"
                  role="link"
                  href={`mailto:${site.email.support}`}
                  label={site.email.support}
                />
              </Row>
            </Column>
            {columns.map((column) => (
              <LinkColumn key={column.title} title={column.title} links={column.links} />
            ))}
          </Row>

          <Divider />

          <Row gap={12} wrap between>
            <Text variant="meta" color="textDim">
              {`© 2026 KROMA. Free software under the ${site.license} license.`}
            </Text>
            <Text variant="meta" color="textDim">
              Built to be owned, not rented.
            </Text>
          </Row>
        </Column>
      </Box>
    </Box>
  );
}
