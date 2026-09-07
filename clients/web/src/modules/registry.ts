import { addCatalogs } from '@kroma/core';
import { ModuleRegistry } from '@kroma/module-sdk';

/** The web app's module registry. Empty until `loadRuntimeRemotes` adopts the
 *  frontends of the modules the server has installed. */
export const moduleRegistry = new ModuleRegistry(addCatalogs);
