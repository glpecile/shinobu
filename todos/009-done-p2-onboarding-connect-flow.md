---
status: done
priority: P2
---

# Connect providers and populate the feed

The acceptance criteria for the connect flow are implemented. Manage Trackers
renders connected and disconnected providers in registry order through
`features/trackers/provider-cards-section.tsx`. Each provider has a connect
action or setup sheet, and the Trakt credentials migration has its own banner.
Simkl is the one-tap default; other providers can require user input or a
native session. This is a tracker-management tab, not a separate first-run
wizard.

`useConnectedProviders` reacts to session changes. Home's provider rows,
`useUnifiedFeed`, and Up Next use the connected set without requiring every
provider. Disconnect removes the local session, provider queries, and the
merged Up Next and watchlist caches (`state/session/index.ts`).

The old Trakt progress N+1 warning is addressed by a recent-show pool,
four concurrent progress reads, and a 15-minute per-show cache
(`state/queries/up-next.ts`). Calendar uses Trakt's my-calendar endpoint rather
than that progress fan. A separate onboarding walkthrough, if wanted, needs a
new scope and acceptance criteria.
