// Native entry point; the WEB entry is src/main.tsx, reached through
// index.html by Vite. The two never meet: this file is not in the site's
// module graph and index.html is not in Metro's.
import { registerRootComponent } from 'expo';
import { App } from './src/App';

registerRootComponent(App);
