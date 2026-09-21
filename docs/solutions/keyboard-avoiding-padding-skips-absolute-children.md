# `KeyboardAvoidingView behavior="padding"` doesn't lift an absolute child

**Symptom (2026-09-20).** On Android the search screen's scope `Fab` stayed
behind the keyboard, though it sat inside
`<KeyboardAvoidingView behavior="padding">` and the list beside it resized
correctly.

**Cause.** react-native-keyboard-controller applies the keyboard height as
`paddingBottom` on the view itself. Padding moves in-flow children only. An
absolutely positioned child anchors to its parent's padding box, so
`absolute bottom-6` kept measuring from the view's real bottom edge, under the
keyboard.

**Fix.** Give the absolute child a frame that is itself in flow:

```tsx
<KeyboardAvoidingView behavior="padding" className="flex-1">
  <View className="flex-1">
    <List … />
    <Fab className="absolute bottom-6 right-6" … />
  </View>
</KeyboardAvoidingView>
```

The inner `View` shrinks with the padding, and the button rides its bottom edge.
