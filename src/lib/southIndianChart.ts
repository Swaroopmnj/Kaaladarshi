// South Indian style Rāśi chart: a 4×4 grid with the 4 center cells merged/
// blank, and each of the 12 outer cells permanently assigned to one rashi
// (unlike North Indian charts, the boxes never rotate — Lagna is marked
// with an indicator inside whichever box it falls in). This is the
// standard fixed layout used by Telugu/Tamil/Kannada panchangams:
//
//   Meena     Mesha      Vrishabha   Mithuna
//   Kumbha      .            .       Karka
//   Makara      .            .       Simha
//   Dhanu     Vrischika   Tula        Kanya
//
// Grid coordinates below are [row, col], 0-indexed, on a 4×4 grid.

export const SOUTH_INDIAN_GRID: { rashiIndex: number; row: number; col: number }[] = [
  { rashiIndex: 11, row: 0, col: 0 }, // Meena
  { rashiIndex: 0, row: 0, col: 1 }, // Mesha
  { rashiIndex: 1, row: 0, col: 2 }, // Vrishabha
  { rashiIndex: 2, row: 0, col: 3 }, // Mithuna
  { rashiIndex: 10, row: 1, col: 0 }, // Kumbha
  { rashiIndex: 3, row: 1, col: 3 }, // Karka
  { rashiIndex: 9, row: 2, col: 0 }, // Makara
  { rashiIndex: 4, row: 2, col: 3 }, // Simha
  { rashiIndex: 8, row: 3, col: 0 }, // Dhanu
  { rashiIndex: 7, row: 3, col: 1 }, // Vrischika
  { rashiIndex: 6, row: 3, col: 2 }, // Tula
  { rashiIndex: 5, row: 3, col: 3 }, // Kanya
];

const PLANET_ABBR: Record<string, string> = {
  Sun: 'Su',
  Moon: 'Mo',
  Mars: 'Ma',
  Mercury: 'Me',
  Jupiter: 'Ju',
  Venus: 'Ve',
  Saturn: 'Sa',
  Rahu: 'Ra',
  Ketu: 'Ke',
};

export function planetAbbr(name: string): string {
  return PLANET_ABBR[name] ?? name.slice(0, 2);
}
