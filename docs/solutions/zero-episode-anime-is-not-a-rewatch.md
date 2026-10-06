# An upcoming anime celebrated as fully watched

## Symptom

Cyberpunk: Edgerunners II showed “Episode 1 airs in 15 days” immediately above
“🎉 You’ve watched every aired episode.”

## Cause

The anime rewatch check compared progress against the known episode total
without requiring a positive total. Zero watched out of zero known episodes
therefore counted as complete. The air-date gate correctly disabled logging,
but the celebration did not consult that gate.

## Fix and verification

`LogMediaButton` requires a positive episode total for an anime rewatch and
only shows completion copy when the episode can be logged. This shared button
covers both the details screen and card-actions sheet.

A simulator fixture with zero progress, zero total, and episode 1 scheduled
15 days ahead reproduced the original contradiction. After the fix, the
countdown remained and the celebration disappeared; screenshot comparison
showed only that line changed. A fully watched, aired anime still celebrates.
