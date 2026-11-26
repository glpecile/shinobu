# Dismissing the Android keyboard from a log sheet

React Native's single-line default, `blurAndSubmit`, clears focus before asking
Android to hide the keyboard. On Android 10 and newer, a single-line `TextField`
with Done uses `submit` so the keyboard controller can request the hide from
the input's window before clearing focus. Android 9 and earlier keep React
Native's default, which guards against another input immediately taking focus
after a blur.
