import type { ReactNode } from 'react';
import type { FamilyMeta } from '#site/components/download/families/meta';

export interface PlatformFamilyProps {
  meta: FamilyMeta;
  picker: ReactNode;
  children: ReactNode;
}

/** Choose a device, then show one download panel just like the desktop apps. */
export function PlatformFamily({ meta, picker, children }: Readonly<PlatformFamilyProps>) {
  return (
    <section id={meta.id} className="scroll-mt-24">
      <h2 className="sr-only">{meta.title}</h2>
      <div className="border-b border-border/60 px-5 py-4 sm:px-9 lg:px-10">{picker}</div>
      <div id={`${meta.id}-download`}>{children}</div>
    </section>
  );
}
