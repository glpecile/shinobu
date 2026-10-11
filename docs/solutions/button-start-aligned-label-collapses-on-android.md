# Content-sized, start-aligned button labels collapse on Android

The season action rendered only its eye icon on Android, hiding "Mark season
as watched". Its button used `align="start"` inside a `self-start` pressable,
so its width came from its contents.

`Button` gave start-aligned labels `flex-1`, which sets a zero flex basis.
During native intrinsic sizing the label contributed no width, leaving only
the icon, gap, and padding.

Use `grow` instead: the label keeps its intrinsic basis and can still occupy
spare width in stretched sheet rows, pushing trailing icons to the far edge.
The fix belongs in the shared button, not a platform-specific season action.
