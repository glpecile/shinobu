# Metro localhost binding misses IPv4 dev-client requests

## Symptom

The iOS simulator shows `Could not connect to development server` for
`http://127.0.0.1:8081/node_modules/expo-router/entry.bundle` even though
`expo start --dev-client --localhost` reports that Metro is ready.

## Cause and fix

On this Mac, `localhost` resolved to IPv6 and Metro listened only on
`[::1]:8081` (`lsof -nP -iTCP:8081 -sTCP:LISTEN`). A host request to
`http://127.0.0.1:8081/status` failed immediately. The dev client resolves its
bundle URL to IPv4, which that listener cannot accept.

Restart Metro with `bun start --dev-client --lan`, verify the IPv4 `/status`
endpoint, then reopen the development-client URL. On Android, also run
`adb -s <serial> reverse tcp:8081 tcp:8081`. No native rebuild or app-code fix
is needed for this connection failure.
