# Kroma client ownership

Create the client inside its application, router, or session owner. Its bearer,
media ticket, refresh handler, locale, and in-flight token exchange belong to that
instance. Another client, including one pointed at another server, starts with
independent state.

```ts
const client = createKromaClient({ baseUrl, locale: 'fr' });
const result = await client.accounts.login(identifier, password);
client.setAuthToken(result.token);
client.session.setSessionMediaTicket(result.mediaTicket);
```

Authentication endpoints adopt a returned media ticket on the calling client.
When a temporary probe authenticates and a different client becomes the session
client, pass both `token` and `mediaTicket` explicitly to that owner. Never apply
a response from one server to a client pointing at another server.

Use `client.session.sharedTokenExchange(() => client.accounts.exchangeToken(accessToken))`
for overlapping ambient boot and refresh exchanges. PIN-gated profile activation
is a distinct action and must not join that exchange.

Event sockets read the same owner at handshake time:

```ts
const events = new KromaEvents(client.baseUrl, {
  token: () => client.sessionToken,
  refresh: () => client.refreshSession(),
  onEvent,
});
events.connect();
// The owning mount calls events.close() during cleanup.
```

The web router creates one API runtime and query cache. Loaders receive it through
router context; components use its provider. Authentication and query factories
share that client, so changing its locale or bearer reaches subsequent requests.

Native storage is supplied by its application root:

```ts
const persistence = createAccountStorage(deviceStore);
persistence.saveSession({ accessToken, user, serverUrl });
const active = persistence.loadSession();
```

Pass the same hydrated backend through `KitProvider config={{ deviceStore }}`
for UI/session preferences. `useAccountStorage()` from `@kromatv/ui` binds session
operations to that backend. Read/write helpers and locale preferences also accept
an explicit backend. A backend of `null` means unavailable; omitted backends use
the browser's platform storage. Browser convenience functions hold no session
state and native apps do not install a process-wide storage pointer.

The former free bearer/ticket/refresh setters, `sharedTokenExchange`,
`setSessionStorage`, and global active-locale setter are replaced by these owners.
