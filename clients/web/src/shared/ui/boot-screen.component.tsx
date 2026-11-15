import { KROMA_LOCKUP, lockupSvg } from '@kromatv/ui/lockup';
import { colors } from '@kromatv/ui/tokens/colors';
import type { ReactNode } from 'react';
import { PAGE_RADIAL } from '#web/shared/ui/page';

const LOCKUP_HEIGHT = 38;
const LOCKUP_WIDTH = Math.round(
  (LOCKUP_HEIGHT * (KROMA_LOCKUP.maX + KROMA_LOCKUP.maWidth)) / KROMA_LOCKUP.height,
);
const LOCKUP_SRC = `data:image/svg+xml,${encodeURIComponent(lockupSvg(colors.text))}`;

/** The rules behind {@link BootScreen}, for the document head. */
export const BOOT_SCREEN_CSS =
  '.kroma-routes{display:contents}.kroma-boot{display:none}' +
  `.kroma-routes:empty+.kroma-boot{display:flex;position:fixed;inset:0;align-items:center;justify-content:center;background-image:${PAGE_RADIAL}}`;

/** The routes, with the gate's lockup on the gate's ground in their place until
 * the first one renders: what the static shell paints before its script runs. */
export function BootScreen({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <>
      <div className="kroma-routes">{children}</div>
      <div className="kroma-boot">
        <img src={LOCKUP_SRC} alt="" width={LOCKUP_WIDTH} height={LOCKUP_HEIGHT} />
      </div>
    </>
  );
}
