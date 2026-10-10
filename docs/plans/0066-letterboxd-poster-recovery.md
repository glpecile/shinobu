# Letterboxd poster recovery

Resolve failed constructed poster URLs from the public film page's Movie
JSON-LD `image`, not its landscape `og:image`. Keep successful images on the
existing fast path. The shared Image wrapper triggers one cached, non-throwing
query after a constructed Letterboxd poster fails, covering every caller and
persisted feed items without eager per-film requests.

Allow only public `GET /film/{slug}/` in the existing Letterboxd Worker relay
for web parity. Do not allow AJAX/API subpaths or proxy images. Validate the
resolved image against the HTTPS Letterboxd artwork CDN. Keep failures local
to artwork and do not loop if the replacement also fails.

Validate canonical upload paths and alternate filenames, missing/malformed
metadata, the proxy security boundary, and live Onibaba/21 Grams/Obsession
poster responses. JS hot reloads; web also needs the updated Worker deployed.
