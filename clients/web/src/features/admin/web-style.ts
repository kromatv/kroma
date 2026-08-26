import type { ViewStyle } from 'react-native';
import { safeAreaTop } from '#web/shared/lib/safe-area';

export const ADMIN_RAIL_WIDTH = 256;

export const ADMIN_SCROLLER: ViewStyle = { flex: 1, minWidth: 0 };

export const ADMIN_SCROLLER_CONTENT: ViewStyle = { flexGrow: 1 };

export const ADMIN_BAR_TOP: ViewStyle = safeAreaTop(10);

/** Marks a surface whose whole area presses: a table row, a store card. Set it
 *  as `data-pressable` and pair it with an [`ADMIN_PRESS`] button as the FIRST
 *  child. A kit <Surface> emits it through `dataSet`; a plain element sets the
 *  attribute directly. */
export const PRESSABLE = { pressable: 'true' } as const;

/** The press of a pressable surface: a button covering it from UNDER its
 *  content, so the controls the surface carries stay real buttons beside it.
 *  Its rule is the kit's, shared with the module SDK's table. */
export const ADMIN_PRESS = 'admin-press';
