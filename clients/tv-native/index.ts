// Entry point. `registerRootComponent` is Expo's AppRegistry.registerComponent
// plus the dev-client wiring, and it is what both the tvOS and the Android TV
// hosts boot into.
import { registerRootComponent } from 'expo';
import { App } from './src/App';

registerRootComponent(App);
