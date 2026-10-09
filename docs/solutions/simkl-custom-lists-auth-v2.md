# Simkl custom lists require AUTH V2

Investigated 2026-10-08 in the current official documentation:
https://api.simkl.org/guides/custom-lists

- Custom lists are not the five-status watchlist already supported by Shinobu.
- The beta reads are `GET /lists/user/{userId}` and `GET /lists/{id}`.
- The guide requires a separately registered AUTH V2 client and a PRO/VIP user
  token. Shinobu currently signs in through AUTH V1 (`/oauth/authorize`,
  `/oauth/token`). Reconnecting the same V1 client does not fix this:
  list reads may answer `403 oauth2_token_required` for a valid V1 session.
- The guide and generated user-index reference disagree on anonymous index
  access. Don't infer support from the reference's anonymous example.
- A free caller can receive **200** with `error: premium_only`, without `items`
  or `pagination`. Never normalize that as an empty list or fake media item.
- Simkl forbids scraping simkl.com; there is no HTML fallback or new proxy.
- List writes aren't supported: even DELETE can return 200 with unchanged
  read data. Don't mistake status success for a write receipt.

The owner chose Serializd browsing plus an external Simkl lists entry, deferring
the V2 migration and in-app Simkl list reads. A future implementation needs a
registered V2 client and a PRO/VIP test account, and must preserve V1 sessions
until a user explicitly migrates.
