# Dev client failed to load: `UnexpectedServerData: No returned query result`

**Symptom:** Opening the app via `bun ios` reached the dev-launcher home screen,
but loading the project logged
`UnexpectedServerData: Unexpected server error: No returned query result` and the
app never started. The dev server's `/manifest` endpoint returned HTTP 500 with
that error as the body. Even `bunx expo whoami` crashed with the same error.

**Cause:** a **stale Expo account session** in `~/.expo/state.json`. The CLI's
GraphQL client sends the stored `sessionSecret` with every `api.expo.dev` call;
when that session has expired/been revoked, `currentUserAsync` returns no result
and throws. Serving a dev-client manifest performs that user lookup, so *every*
manifest request 500s — on every Metro instance on the machine. Nothing is wrong
with the project, Metro, or the network (the API itself returns 200).

**Red herrings:** the error message blames the *server*; the dev-launcher screen
suggests picking the right dev server (multiple listed is normal — e.g. one
`expo run:ios` Metro on 8081 and one `expo start --web` on 8090). Neither is the
issue. `EXPO_OFFLINE=1 bunx expo whoami` printing a clean "Not logged in" instead
of the crash is the confirming test — offline mode skips the poisoned session.

**Fix:** clear the stale session; no dev-server restart needed (auth state is
read per request):

```sh
bunx expo logout     # or delete the "auth" key from ~/.expo/state.json
bunx expo whoami     # should print "Not logged in" instead of crashing
```

Log back in with `bunx expo login` if desired — local dev-client development
works fine logged out.

**Note:** this same error body appeared earlier as the HTTP 500 in
`expo-dev-client-vs-expo-go.md`. The Expo Go/nitro-modules diagnosis there stands
on its own, but the 500 itself was this session issue.
