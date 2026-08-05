// Kalasa Chakra Shuddhi (for Griha Pravesh / house entry) and Vrishabha
// Chakra Shuddhi (for Griha Arambha / foundation-laying) — both computed the
// same way: count the muhurta's nakshatra distance from Revati (1..27) and
// check it falls in the auspicious band.
//
// Source: classical rule as summarised by Desabhatla, "Muhurtha for
// Gruhapravesam to a New House" — distances 6-13 and 22-27 (counted from
// Revati) are auspicious; 1-5 and 14-21 are inauspicious. The source states
// this single distance-based method underlies both Chakras (Kalasa for
// Pravesham, Vrishabha for Arambham); we apply the same table to both since
// no separate table is given for each, and say so in the UI.

const REVATI_INDEX = 26; // 0-based: Ashwini=0 … Revati=26

const GOOD_DISTANCES = new Set([6, 7, 8, 9, 10, 11, 12, 13, 22, 23, 24, 25, 26, 27]);

export function chakraDistanceFromRevati(nakshatraIdx: number): number {
  return ((nakshatraIdx - REVATI_INDEX - 1 + 27) % 27) + 1;
}

export function isChakraShuddhi(nakshatraIdx: number): boolean {
  return GOOD_DISTANCES.has(chakraDistanceFromRevati(nakshatraIdx));
}
