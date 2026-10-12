# Sheet dismissal context and Fast Refresh

Keep `SheetCloseContext` in `components/sheet/context.ts`, separate from the
header component. Native sheets retain their React subtree in the bottom-sheet
portal. Editing a module that exports both the header and its context can leave
the retained provider using the previous context while the refreshed header
reads the new one, causing “Sheet.Header needs a Sheet or onClose.”

Reproduced while adding the header and while editing its layout on the iPhone
simulator. A full JS reload clears the mismatch. Separating context creation
from header rendering keeps header-only Fast Refresh from recreating it.
