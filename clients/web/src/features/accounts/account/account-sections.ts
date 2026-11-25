export const ACCOUNT_SECTIONS = [
  'profile',
  'preferences',
  'notifications',
  'security',
  'devices',
  'about',
] as const;

export type AccountSection = (typeof ACCOUNT_SECTIONS)[number];
