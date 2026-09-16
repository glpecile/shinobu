export interface Glyph {
  /** Stable across renders for a character that survives a text change. */
  key: number;
  char: string;
}

export interface GlyphRun {
  text: string;
  glyphs: Glyph[];
  nextKey: number;
}

/** Index pairs of a longest common subsequence, in order. */
function commonPairs(a: string[], b: string[]): Array<[number, number]> {
  // suffix[i][j] = LCS length of a[i..] and b[j..]; strings are short labels,
  // so the O(n·m) table is nothing.
  const suffix = Array.from({ length: a.length + 1 }, () =>
    Array.from({ length: b.length + 1 }, () => 0),
  );
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      suffix[i][j] =
        a[i] === b[j]
          ? suffix[i + 1][j + 1] + 1
          : Math.max(suffix[i + 1][j], suffix[i][j + 1]);
    }
  }
  const pairs: Array<[number, number]> = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      pairs.push([i, j]);
      i++;
      j++;
    } else if (suffix[i + 1][j] >= suffix[i][j + 1]) {
      i++;
    } else {
      j++;
    }
  }
  return pairs;
}

/**
 * Re-keys `text` against the run on screen: characters the diff keeps carry
 * their key (and so their node) over, the rest are fresh. Same text returns
 * the same run.
 */
export function morphRun(previous: GlyphRun, text: string): GlyphRun {
  if (text === previous.text) return previous;
  const chars = Array.from(text);
  const kept = new Map<number, Glyph>();
  for (const [from, to] of commonPairs(
    previous.glyphs.map((glyph) => glyph.char),
    chars,
  )) {
    kept.set(to, previous.glyphs[from]);
  }
  let nextKey = previous.nextKey;
  const glyphs = chars.map((char, index) => kept.get(index) ?? { key: nextKey++, char });
  return { text, glyphs, nextKey };
}

export function initialRun(text: string): GlyphRun {
  return morphRun({ text: '', glyphs: [], nextKey: 0 }, text);
}
