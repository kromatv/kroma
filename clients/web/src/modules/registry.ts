import { addCatalogs } from '@kromatv/core';
import { ModuleRegistry } from '@kromatv/module-sdk';

/** The web app's module registry. Empty until `loadRuntimeRemotes` adopts the
 *  frontends of the modules the server has installed. */
export const moduleRegistry = new ModuleRegistry(addCatalogs);
