// Native entry point. `registerRootComponent` is Expo's
// AppRegistry.registerComponent plus the dev-client wiring, and it is what the
// tvOS, Android TV, iOS and Android hosts all boot into.
//
// The WEB entry is src/main.tsx, reached through index.html by Vite. The two
// never meet: this file is not in the site's module graph and index.html is not
// in Metro's.
import { registerRootComponent } from 'expo';
import { App } from './src/App';

registerRootComponent(App);
