# Floating controls and logging color

- Use fixed size props on all platforms: sm 44 with a 20px icon, md 56 with a 24px icon. Default to md and prevent flex stretching. Apply a small optical correction to the film glyph.
- Default FABs to a bordered, surfaced squircle, using the Twitter reference for compact proportions. Expose circle as a separate shape prop. Keep outline, filled, and log color variants independent of size and shape, and reuse Fab for View series.
- Reserve solid red action buttons for logging with a #DC2625 token and explicit button variant. Other primary actions are neutral. Keep the red loading logo, softer red tints, and the neutral View all treatment.
- Use the neutral bordered button variant for every available tracker Connect action.
- Give the Today artwork badge the softer selected-day tonal red.
- Match episode rating stars to the series header's muted token.
- Enforce logging-only color use with oxlint and verify the rule at its CLI boundary. Check layout and interactions on running simulators, plus the repository static checks.
