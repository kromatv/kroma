// Metro for the mobile client. Everything is shared with the native TV client:
// see clients/expo-build/metro-workspace.ts for what it does and why.

import { expoWorkspaceConfig } from '../expo-build/metro-workspace.ts';

export default expoWorkspaceConfig(import.meta.dirname);
