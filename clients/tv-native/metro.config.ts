// Metro for the native TV client. Everything shared with the mobile client lives
// in the workspace factory; what is local is the `#tv/*` subpath alias that
// @kroma/tv uses internally (it mirrors tsconfig.base paths).

import path from 'node:path';
import { expoWorkspaceConfig } from '../expo-build/metro-workspace.ts';

export default expoWorkspaceConfig(import.meta.dirname, {
  '#tv': path.resolve(import.meta.dirname, '../../packages/tv/src'),
});
