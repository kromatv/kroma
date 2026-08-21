import { site } from '@kroma/site-meta';
import type { ReactNode } from 'react';

export const docs = {
  releases: `${site.repo}/releases`,
  installGuide: `${site.repo}/blob/main/INSTALL.md`,
  beta: `${site.repo}/blob/main/BETA.md`,
} as const;

/**
 * One TestFlight beta serves both Apple platforms: an Apple TV cannot open a
 * link, so a tester joins on a phone and the television offers the same app.
 */
export const join = {
  testflight: 'https://testflight.apple.com/join/RvvRxgvV',
  firebase: 'https://appdistribution.firebase.dev/i/3aa500cefb6aeb83',
} as const;

export interface ProseLinkProps {
  href: string;
  children: ReactNode;
}

export function ProseLink({ href, children }: Readonly<ProseLinkProps>) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="text-accent-text underline decoration-accent-text/40 underline-offset-2 hover:decoration-accent-text"
    >
      {children}
    </a>
  );
}
