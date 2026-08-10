// The Luna binding the television provides to a JS Service. Not on npm, and not
// in the bundle: declared here so the service can be written in TypeScript.

declare module 'webos-service' {
  export interface LunaMessage {
    payload: Record<string, unknown>;
    respond(response: Record<string, unknown>): void;
  }

  export default class Service {
    constructor(id: string);
    register(method: string, handler: (message: LunaMessage) => void): void;
  }
}
