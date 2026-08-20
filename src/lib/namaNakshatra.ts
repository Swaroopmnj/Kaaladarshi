// Nāmakaraṇa Akṣara (Avakahada Chakra) — the classical 108-syllable table
// (27 nakṣatras × 4 pādas) traditionally used to choose a child's first
// name-syllable from their birth Moon's exact pāda. Source: cross-verified
// against two independent tabulations (VedicFeed's Swar Siddhānta table and
// Nakshatrica's FAQ) — both agree exactly on Ashwini's four syllables
// (Chu/Che/Cho/Lā), which is the entry checked before trusting the rest of
// the table. Spelling of the phonetic syllables varies slightly across
// sources (transliteration is not standardised); the phonetic *category* is
// what matters for matching a name, so lookups below are done by loose
// phonetic prefix match, not exact string equality.
//
// IMPORTANT LIMITATION, stated plainly rather than buried: several nakṣatra
// padas share phonetically similar or identical-sounding syllables (e.g.
// multiple padas start with a "T"/"Ta" sound), and modern names often don't
// strictly follow this system at all. This tool can only narrow down
// candidates, not give a single certain answer — every function here
// returns a LIST of possible pādas, never a lone guess presented as fact.

export interface NamaPada {
  nakshatraIndex: number; // 0-based, matches NAKSHATRAS array elsewhere
  nakshatraName: string;
  pada: 1 | 2 | 3 | 4;
  syllable: string;
}

const NAKSHATRA_NAMES_108 = [
  'Ashwini', 'Bharani', 'Krittika', 'Rohini', 'Mrigashira', 'Ardra', 'Punarvasu', 'Pushya', 'Ashlesha',
  'Magha', 'Purva Phalguni', 'Uttara Phalguni', 'Hasta', 'Chitra', 'Swati', 'Vishakha', 'Anuradha', 'Jyeshtha',
  'Mula', 'Purva Ashadha', 'Uttara Ashadha', 'Shravana', 'Dhanishtha', 'Shatabhisha', 'Purva Bhadrapada', 'Uttara Bhadrapada', 'Revati',
];

// [Pada1, Pada2, Pada3, Pada4] per nakshatra, in NAKSHATRA_NAMES_108 order.
const SYLLABLES_108: [string, string, string, string][] = [
  ['Chu', 'Che', 'Cho', 'La'],       // Ashwini
  ['Li', 'Lu', 'Le', 'Lo'],          // Bharani
  ['A', 'I', 'U', 'E'],              // Krittika
  ['O', 'Va', 'Vi', 'Vu'],           // Rohini
  ['Ve', 'Vo', 'Ka', 'Ki'],          // Mrigashira
  ['Ku', 'Gha', 'Ing', 'Chha'],      // Ardra
  ['Ke', 'Ko', 'Ha', 'Hi'],          // Punarvasu
  ['Hu', 'He', 'Ho', 'Da'],          // Pushya
  ['Di', 'Du', 'De', 'Do'],          // Ashlesha
  ['Ma', 'Mi', 'Mu', 'Me'],          // Magha
  ['Mo', 'Ta', 'Ti', 'Tu'],          // Purva Phalguni
  ['Te', 'To', 'Pa', 'Pi'],          // Uttara Phalguni
  ['Pu', 'Sha', 'Na', 'Tha'],        // Hasta
  ['Pe', 'Po', 'Ra', 'Ri'],          // Chitra
  ['Ru', 'Re', 'Ro', 'Ta'],          // Swati
  ['Ti', 'Tu', 'Te', 'To'],          // Vishakha
  ['Na', 'Ni', 'Nu', 'Ne'],          // Anuradha
  ['No', 'Ya', 'Yi', 'Yu'],          // Jyeshtha
  ['Ye', 'Yo', 'Bha', 'Bhi'],        // Mula
  ['Bhu', 'Dha', 'Pha', 'Dha'],      // Purva Ashadha
  ['Bhe', 'Bho', 'Ja', 'Ji'],        // Uttara Ashadha
  ['Khi', 'Khu', 'Khe', 'Kho'],      // Shravana
  ['Ga', 'Gi', 'Gu', 'Ge'],          // Dhanishtha
  ['Go', 'Sa', 'Si', 'Su'],          // Shatabhisha
  ['Se', 'So', 'Da', 'Di'],          // Purva Bhadrapada
  ['Du', 'Tha', 'Jha', 'Yna'],       // Uttara Bhadrapada
  ['De', 'Do', 'Cha', 'Chi'],        // Revati
];

export const NAMA_PADA_TABLE: NamaPada[] = NAKSHATRA_NAMES_108.flatMap((name, nakIdx) =>
  SYLLABLES_108[nakIdx].map((syllable, i) => ({
    nakshatraIndex: nakIdx,
    nakshatraName: name,
    pada: (i + 1) as 1 | 2 | 3 | 4,
    syllable,
  })),
);

// Loose phonetic normalisation: lowercase, strip diacritics/silent letters
// that vary across transliteration schemes, and only compare the first 1–2
// characters — this is deliberately forgiving, since the goal is "narrow
// down candidates" not "exact string match" (a name spelled "Chandana"
// should still surface the "Cha"/Chu-type entries).
function normalise(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z]/g, '');
}

/** Every candidate nakṣatra/pāda whose syllable could plausibly start the given name. */
export function findNamaCandidates(name: string): NamaPada[] {
  const n = normalise(name);
  if (!n) return [];
  return NAMA_PADA_TABLE.filter((entry) => {
    const syl = normalise(entry.syllable);
    const shortSyl = syl.slice(0, Math.min(2, syl.length));
    return n.startsWith(syl) || n.startsWith(shortSyl) || syl.startsWith(n.slice(0, Math.min(2, n.length)));
  });
}
