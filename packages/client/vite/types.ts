import { writeDomainIndex } from './domains.ts';
import { CLIENT_API } from './index.ts';

const { path, changed } = writeDomainIndex(CLIENT_API);
console.log(changed ? `wrote ${path}` : `${path} is current`);
