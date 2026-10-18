import { useState } from 'react';
import { useKitSettings } from './kit-settings';
import { createMenuKeys } from './menu-keys';

export function useMenuKeys() {
  const { menuKeys: provided } = useKitSettings();
  const [owned] = useState(createMenuKeys);
  return provided ?? owned;
}
