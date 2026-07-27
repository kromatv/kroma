// The bench is the TV app's rendering path, so it is built exactly like a TV
// shell: same react-native-web alias, same `.web` resolution, same transforms.
import { tvShellConfig } from '../tv-build/shell';
import { target } from './tv.target';

export default tvShellConfig(import.meta.url, target);
