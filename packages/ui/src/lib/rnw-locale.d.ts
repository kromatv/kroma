declare module 'react-native-web' {
  export function useLocaleContext(): { direction: 'ltr' | 'rtl'; locale?: string };
}
