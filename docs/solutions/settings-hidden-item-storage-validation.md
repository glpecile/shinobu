# Hidden item metadata must not replace its storage identity

Settings stores new hidden items as JSON containing a title and media type;
older entries remain plain title strings. The storage key owns the item id.

Returning a parsed JSON object unchanged let unexpected fields override the
key-derived id when the reader spread it into a hidden item. An unknown media
type also reached Settings' icon and label lookups unchecked.

Decode only the title and the four supported media types. Unknown types retain
the title and use the legacy icon. Plain titles remain readable. The existing
hidden-items tests cover typed writes, legacy reads, and rejection of an
unexpected id and type in stored JSON.
