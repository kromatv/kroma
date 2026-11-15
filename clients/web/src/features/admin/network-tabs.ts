export const NETWORK_TABS = [
  'connections',
  'destinations',
  'inbound',
  'rules',
  'middleware',
  'listeners',
  'settings',
] as const;

export type NetworkTab = (typeof NETWORK_TABS)[number];
