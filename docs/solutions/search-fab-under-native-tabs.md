# Search FAB under the iOS tab bar

The search-scope FAB sat behind the detached iOS 26 Search tab. Its red fill
showed through the tab's Liquid Glass, making the problem look like a tab tint
issue. Changing the tab's tint or selected icon color did not move the FAB.

Native tabs draw iOS content beneath the tab bar. A list can receive automatic
scroll insets, but an absolutely positioned sibling does not. Wrap the search
content in `SafeAreaView` from `react-native-screens/experimental` with the
bottom edge enabled on iOS. Android's native tab host already insets content.

Place the safe-area wrapper outside `KeyboardAvoidingView`. Putting it inside
adds the tab-bar padding above the keyboard too. Set `automaticOffset` on the
keyboard-avoiding view so it measures its screen position below the search
header instead of using its parent-relative position. Keep the FAB inside a
flex child of that view so it follows the padded content edge.

Verify keyboard-open and keyboard-closed states after a fresh mount. Keyboard
layout measurements retained across Fast Refresh can hide a positioning change.
