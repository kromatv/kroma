// The web app's frontend module registry: adding a module is one import plus one
// register() line.

import { addCatalogs } from '@kroma/core';
import { acquisitionModule } from '@kroma/module-acquisition';
import { indexerModule } from '@kroma/module-indexer';
import { remoteModule } from '@kroma/module-remote';
import { ModuleRegistry } from '@kroma/module-sdk';
import { torrentsModule } from '@kroma/module-torrents';
import { vpnModule } from '@kroma/module-vpn';
import { generatedModules } from '@kroma/modules-generated';

export const moduleRegistry = new ModuleRegistry(addCatalogs);
moduleRegistry.register(indexerModule);
moduleRegistry.register(torrentsModule);
moduleRegistry.register(vpnModule);
moduleRegistry.register(remoteModule);
moduleRegistry.register(acquisitionModule);
for (const m of generatedModules) moduleRegistry.register(m);
