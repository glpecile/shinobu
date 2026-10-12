# Native filter and year menus

Use the installed Expo UI `MenuView` for the watchlist tracker filter and anime
season year selector on iOS and Android. Anchor each menu to its existing
trigger, show the selected option with a native checkmark, and retain tracker
counts (including partial-count floors). Keep the clear-filter action separate
and the previous/next year controls unchanged.

Share a native menu wrapper between the two controls. Web keeps its existing
tracker sheet and year grid; do not load native UI there. No dependency or
native configuration changes are needed.

On Android, use Compose's `DropdownMenuItem.LeadingIcon` with `RNHostView` to
reuse the app's full-color provider logos. The community menu adapter tints
images and SwiftUI's adapter only accepts SF Symbols; retain the adapter on iOS
without substituting unrelated symbols for provider branding.
