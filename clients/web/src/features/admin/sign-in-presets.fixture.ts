import type { PresetView } from '@kromatv/client/sso';

const WHITE_ON_GREY = {
  fill: '#4d4d4d',
  ink: '#ffffff',
  logo: '/api/auth/logos/keycloak/white.svg?v=1',
};

/** Three presets as a server sends them: one with a look of its own, one that
 * reads another name than its own and sends its groups elsewhere, and one
 * that every server reaches at the same address. */
export const PRESETS: PresetView[] = [
  {
    id: 'keycloak',
    name: 'Keycloak',
    label: 'Keycloak',
    icon: 'key',
    issuer: 'https://auth.example.com/realms/REALM',
    scopes: [],
    groupClaim: 'groups',
    docs: 'https://www.keycloak.org/docs',
    logo: '/api/auth/logos/keycloak/mark.svg?v=1',
    brand: { dark: WHITE_ON_GREY, light: WHITE_ON_GREY },
  },
  {
    id: 'entra',
    name: 'Microsoft Entra ID',
    label: 'Microsoft',
    icon: 'brand-windows',
    issuer: 'https://login.microsoftonline.com/TENANT_ID/v2.0',
    scopes: ['offline_access'],
    groupClaim: 'roles',
    console: 'https://entra.microsoft.com/',
    docs: 'https://learn.microsoft.com/entra',
    logo: '/api/auth/logos/entra/mark.svg?v=1',
  },
  {
    id: 'google',
    name: 'Google',
    label: 'Google',
    icon: 'brand-google',
    issuer: 'https://accounts.google.com',
    scopes: [],
    groupClaim: 'groups',
    console: 'https://console.cloud.google.com/apis/credentials',
    docs: 'https://developers.google.com/identity',
    logo: '/api/auth/logos/google/mark.svg?v=1',
  },
];

export function fixturePreset(id: string): PresetView {
  const found = PRESETS.find((preset) => preset.id === id);
  if (!found) throw new Error(`no fixture preset named ${id}`);
  return found;
}
