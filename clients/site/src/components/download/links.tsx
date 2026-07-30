import type { ReactNode } from 'react';
import { site } from '#site/lib/site';

/** The off-site destinations this page links to. Language-neutral, so they live
 *  with the components rather than in the catalog: the hero, the family panels and
 *  the closing CTA all import them from here and cannot drift apart. */
export const docs = {
  releases: `${site.repo}/releases`,
  installGuide: `${site.repo}/blob/main/INSTALL.md`,
  beta: `${site.repo}/blob/main/BETA.md`,
} as const;

export interface ProseLinkProps {
  href: string;
  children: ReactNode;
}

/**
 * An external link beside prose: the same amber-underline treatment everywhere.
 *
 * It sits NEXT TO a sentence rather than inside one - a Paraglide message is a
 * plain string, so the anchor cannot live in the middle of it. The sentence ends,
 * then this link carries its own label (its own message key, arrow included).
 */
export function ProseLink({ href, children }: Readonly<ProseLinkProps>) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent"
    >
      {children}
    </a>
  );
}
