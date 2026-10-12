# External link handoff

List-header external-link buttons and 4chan discussion cards open directly via
the OS on native and a new tab on web. Their external glyph becomes a spinner
until the handoff resolves, repeated presses are disabled, and failures restore
the control with an error toast so it can be retried.

Discussion search links use the same direct handoff. Give the options sheet
spacing below its shared header instead of margin inside the title, and add a
Refresh discussions action backed by the existing board queries' `refetch`.
Refreshing closes the sheet immediately; the queries run in the background.

Keep other external links in the in-app browser: Android media-domain intents
can otherwise route back into Shinobu. List URLs and 4chan URLs do not match
those media-path filters. No native dependency or rebuild is needed.

All external View on chips replace their trailing glyph with a spinner while
their existing opener is pending. Keep the provider mark and label visible,
reserve the spinner's slot, disable repeated presses, and restore retry on error.
Their browser presentation stays unchanged, including iOS's dismissal lifecycle.
