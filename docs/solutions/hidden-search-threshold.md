# Keep an active hidden-item search editable

The Hidden section offers search above 20 entries. Unhiding a search result
can reduce the count to 20 while the query still filters the remaining items.
Removing the field at that point leaves no way to clear the filter.

Keep the search field while its query is nonempty. Verified on the iPhone
simulator by searching 21 temporary entries, unhiding the only match, and
clearing the query after the count fell to 20.
