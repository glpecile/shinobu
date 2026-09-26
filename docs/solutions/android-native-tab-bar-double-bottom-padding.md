# Android NativeTabs and scroll padding

On Home, the feed's `pb-24` left a large blank strip after “Back to top” on Android. The Material bottom tab bar already reserves space outside the screen's scroll view, so that padding was added on top of the bar's own layout space.

Use only a small end margin for Android's feed (`pb-4`). Keep the larger clearance on iOS, where the floating native tab bar can overlap scroll content. Web has its own sidebar and bottom spacing.
