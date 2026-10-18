import { styles } from '@kromatv/ui/kit';
import { safeAreaTop } from '#web/shared/lib/safe-area';

export const ADMIN_RAIL_WIDTH = 256;

const sDefinition = styles({
  scroller: { flex: true, minWidth: 0 },
  scrollerContent: { flexGrow: 1 },
  barTop: safeAreaTop(10),
});

export const ADMIN_SCROLLER = sDefinition.scroller;

export const ADMIN_SCROLLER_CONTENT = sDefinition.scrollerContent;

export const ADMIN_BAR_TOP = sDefinition.barTop;
