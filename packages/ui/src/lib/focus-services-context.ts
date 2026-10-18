import { createContext, useContext, useEffect, useState } from 'react';
import { createFocusServices, type FocusServices } from './focus-services';

const Context = createContext<FocusServices | null>(null);
export const FocusServicesProvider = Context.Provider;
export const useFocusServicesParent = () => useContext(Context);
export function useFocusServices() {
  const provided = useContext(Context);
  const [owned] = useState(() => (provided ? null : createFocusServices()));
  const services = provided ?? owned;
  if (!services) throw new Error('Focus services require their owning host');
  useEffect(() => (provided ? undefined : services.source.retain()), [provided, services]);
  return services;
}
