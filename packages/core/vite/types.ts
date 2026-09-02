import { writeCatalogTypes } from '@kroma/i18n/vite';
import { DEFAULT_LOCALE_CODE } from '../src/locales/default-locale.ts';
import { CORE_LOCALES } from './index.ts';

const { path, changed } = writeCatalogTypes(CORE_LOCALES, DEFAULT_LOCALE_CODE);
console.log(changed ? `wrote ${path}` : `${path} is current`);
