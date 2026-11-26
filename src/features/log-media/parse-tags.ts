export function parseTags(input: string): string[] {
  return input
    .split(',')
    .map((tag) => tag.trim())
    .filter((tag) => tag !== '');
}

export function committedTags(input: string): string[] {
  return parseTags(input.slice(0, input.lastIndexOf(',') + 1));
}

export function isTagSelected(input: string, tag: string): boolean {
  const needle = tag.toLowerCase();
  return committedTags(input).some((existing) => existing.toLowerCase() === needle);
}

export function toggleTag(input: string, tag: string): string {
  const tags = committedTags(input);
  const needle = tag.toLowerCase();
  const without = tags.filter((existing) => existing.toLowerCase() !== needle);
  const next = without.length === tags.length ? [...tags, tag] : without;

  if (next.length === 0) return '';
  return `${next.join(', ')}, `;
}

export function pinSelectedTags(suggestions: readonly string[], input: string): string[] {
  const canonical = new Map<string, string>();
  for (const tag of suggestions) {
    const key = tag.toLowerCase();
    if (!canonical.has(key)) canonical.set(key, tag);
  }

  const pinned = new Set<string>();
  const ordered: string[] = [];
  for (const tag of committedTags(input)) {
    const key = tag.toLowerCase();
    if (pinned.has(key)) continue;
    pinned.add(key);
    ordered.push(canonical.get(key) ?? tag);
  }
  for (const tag of suggestions) {
    if (!pinned.has(tag.toLowerCase())) ordered.push(tag);
  }

  return ordered;
}

export function activeTagFragment(input: string): string {
  return input.slice(input.lastIndexOf(',') + 1).trim();
}

export function filterTagSuggestions(suggestions: readonly string[], fragment: string): string[] {
  const needle = fragment.trim().toLowerCase();
  if (needle === '') return [...suggestions];

  const prefix: string[] = [];
  const contains: string[] = [];
  for (const tag of suggestions) {
    const haystack = tag.toLowerCase();
    if (haystack.startsWith(needle)) prefix.push(tag);
    else if (haystack.includes(needle)) contains.push(tag);
  }
  return [...prefix, ...contains];
}
