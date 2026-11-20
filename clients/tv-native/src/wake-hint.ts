export interface WakeHintInputs {
  expoConfig: { android?: { package?: string } } | null | undefined;
  address: string | null;
}

/** What this set says about reaching itself: the id the app is installed under
 * and its address on the network. Either is left out when unknown. */
export function nativeWakeHint({ expoConfig, address }: WakeHintInputs) {
  return { appId: expoConfig?.android?.package, address: address ?? undefined };
}
