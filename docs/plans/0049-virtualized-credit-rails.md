# Virtualized credit rails

## Evidence and scope

Android study PR #184 measured 56 mounted `PersonCard`s across Inception and
the second movie. Returning through Back removes all details/person screens;
do not change navigation freezing or query retention on this evidence.

Replace `PeopleSection`'s eager `Rail` + map with the installed `List`, following
`MediaCarousel`. Keep every credit reachable, the trailing fade, nested Android
scrolling, person presses, credit-sheet long presses, and display-only characters.
Recycling stays disabled because cards own hover state. Size the horizontal
viewport for the avatar and up to three text lines, including font scaling.

## Validation gate

Compare the same loaded titles and viewport before/after: at least 15% fewer
mounted credit cards, bounded by the draw window rather than the full cast.
Profile the recorded path and check horizontal scrolling, person navigation,
Back to Home, and Home scrolling through Argent. Timing under this overloaded
emulator is a limitation, not a physical-device speedup claim. Do not merge
without successful UI replay and measured benefit. JS-only; no native rebuild.
