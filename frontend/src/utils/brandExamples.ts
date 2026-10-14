// Example look-alike lines for the registered brand (never a fixed demo brand). Pure, so it can be unit tested.

export interface BrandExamples {
  compact: string;
  swap: string;
  digit: string;
  addedWord: string;
  addedPhrase: string;
  spaced: string;
  separated: string;
  transposed: string;
  missing: string;
  other: string;
}

const compactOf = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, '');

function swapGlyph(text: string): string {
  for (const [a, b] of [['m', 'rn'], ['w', 'vv'], ['d', 'cl'], ['l', 'i']] as const) {
    if (text.includes(a)) return text.replace(a, b);
  }
  return `${text}x`;
}

function swapDigit(text: string): string {
  for (const [a, b] of [['e', '3'], ['a', '4'], ['o', '0'], ['i', '1'], ['s', '5']] as const) {
    if (text.includes(a)) return text.replace(a, b);
  }
  return `${text}1`;
}

/** Short names (1-2 letters) and one-word names get sensible fallbacks instead of broken strings. */
export function brandExamples(name: string): BrandExamples {
  const tokens = name.trim().split(/\s+/).filter(Boolean);
  const shown = tokens.join(' ') || 'Brand';
  const compact = compactOf(shown) || 'brand';
  const first = tokens[0] || 'Brand';
  const letters = [...compact];
  const swap = swapGlyph(compact);
  const transposed = letters.length >= 3 ? [...letters.slice(0, -2), letters[letters.length - 1], letters[letters.length - 2]].join('') : `${compact}${compact.slice(-1)}`;
  const missing = letters.length >= 4 ? [...letters.slice(0, -2), letters[letters.length - 1]].join('') : `${compact}-`;
  const spaced = letters.length >= 2 ? letters.join(' ').toUpperCase() : `${compact.toUpperCase()} .`;
  const separated = tokens.length > 1 ? tokens.map((t) => t.toLowerCase()).join('_') : letters.length >= 4 ? `${compact.slice(0, Math.ceil(letters.length / 2))}_${compact.slice(Math.ceil(letters.length / 2))}` : `${compact}_`;
  return {
    compact,
    swap: swap === compact ? `${compact}x` : swap,
    digit: swapDigit(compact),
    addedWord: `${compact}-support`,
    addedPhrase: `${shown} Official Helpline`,
    spaced,
    separated,
    transposed,
    missing,
    other: `${first} Bakery`,
  };
}
