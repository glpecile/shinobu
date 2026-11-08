# Android refresh wrapper blocks scrolling

## Cause

On Android, React Native renders a scroll view's `refreshControl` around the
native scroll view. Gesture Handler's scroll component recognizes its own
`SwipeRefreshLayout` and attaches the native scroll gesture to the child
scroll view. A custom refresh control whose root is an ordinary view instead
makes that gesture attach to the wrapper. Vertical scrolling and nested
horizontal rails then compete against the wrong native view.

## Fix

`GestureScrollView` renders the custom Android refresh control outside
Gesture Handler's scroll component, not in React Native's `refreshControl`
slot. The scroll component therefore attaches its gesture to the native scroll
view, and passes that gesture to the refresh pan through `PullScrollContext`.
The pan fails when a touch begins away from the top, moves up, or moves
horizontally, leaving ordinary scrolls to the native views. iOS keeps its
native refresh control, and web keeps its existing behavior.
