import { IconDeviceDesktop, IconDeviceMobile, IconDeviceTv, IconServer } from '@tabler/icons-react';
import type { IconComponent } from '#site/components/download/icon';
import { m } from '#site/paraglide/messages';

export interface FamilyMeta {
  /** The anchor the device nav and the platform guess both jump to. */
  id: 'tv' | 'desktop' | 'mobile' | 'nas';
  icon: IconComponent;
  title: string;
}

/**
 * The four device families, in the order the page lists them.
 *
 * One table rather than a heading in each family file, because the device nav
 * has to name and link the same four and must not drift from them. Called at
 * render, since a title is a message and a message resolves per locale.
 */
export const families = (): readonly FamilyMeta[] => [
  { id: 'tv', icon: IconDeviceTv, title: m.download_family_tv_title() },
  { id: 'desktop', icon: IconDeviceDesktop, title: m.download_family_desktop_title() },
  { id: 'mobile', icon: IconDeviceMobile, title: m.download_family_mobile_title() },
  { id: 'nas', icon: IconServer, title: m.download_family_nas_title() },
];

/** One family's own row of the table. */
export function family(id: FamilyMeta['id']): FamilyMeta {
  const found = families().find((f) => f.id === id);
  if (!found) throw new Error(`no such device family: ${id}`);
  return found;
}
