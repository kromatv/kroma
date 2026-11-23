import { styles } from '#ui/core';

export const s = styles({
  demo: { py: 16, px: 28, radius: 'xl', bg: 'surface2' },
  member: { flex: true, row: true, align: 'center', gap: 12, px: 14, py: 10 },
  trash: { center: true, w: 40, h: 40, radius: 'md', mx: 6 },
  tile: { w: 140, gap: 10 },
  art: { aspect: 2 / 3, radius: 'xl', overflow: 'hidden' },
});

export const MEMBER_STATES = { focus: { bg: 'accentSoft' }, hover: { bg: 'surface3' } } as const;
