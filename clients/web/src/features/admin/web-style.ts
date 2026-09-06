import { styles } from '@kroma/ui/kit';
import { safeAreaTop } from '#web/shared/lib/safe-area';

export const ADMIN_RAIL_WIDTH = 256;

const s = styles({
  scroller: { flex: true, minWidth: 0 },
  scrollerContent: { flexGrow: 1 },
  barTop: safeAreaTop(10),
});

export const ADMIN_SCROLLER = s.scroller;

export const ADMIN_SCROLLER_CONTENT = s.scrollerContent;

export const ADMIN_BAR_TOP = s.barTop;
