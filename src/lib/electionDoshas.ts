import type { BirthChart } from 'panchang-ts';

export type DoshaState = 'clear' | 'present' | 'not-evaluated';
export interface ElectionDoshaCheck {
  n: number;
  name: string;
  state: DoshaState;
  severity: 'major' | 'moderate' | 'info';
  detail: string;
}

const HARD_MALEFICS = new Set(['Sun', 'Mars', 'Saturn', 'Rahu', 'Ketu']);

function planet(chart: BirthChart, name: string) {
  return chart.planets.find((p) => p.planet.toLowerCase() === name.toLowerCase());
}

/**
 * Phase-2 election-chart checks that can be determined directly and
 * transparently from the D1/whole-sign chart returned by panchang-ts.
 *
 * IMPORTANT: this function DETECTS the underlying configuration only.
 * It does not silently apply a dosha-bhanga.  Cancellation/apavada is a
 * separate layer because it is activity- and textual-tradition-specific.
 */
export function evaluateElectionMahadoshas(chart: BirthChart): ElectionDoshaCheck[] {
  const moon = planet(chart, 'Moon');
  const venus = planet(chart, 'Venus');
  const mars = planet(chart, 'Mars');

  const h2 = chart.planets.filter((p) => p.house === 2 && HARD_MALEFICS.has(p.planet));
  const h12 = chart.planets.filter((p) => p.house === 12 && HARD_MALEFICS.has(p.planet));
  const karthari = h2.length > 0 && h12.length > 0;

  const moonBadHouse = !!moon && [6, 8, 12].includes(moon.house);
  const moonConj = moon
    ? chart.planets.filter((p) => p.planet !== 'Moon' && p.rashi.index === moon.rashi.index)
    : [];

  return [
    {
      n: 3, name: 'Karthari Dosha', state: karthari ? 'present' : 'clear', severity: 'major',
      detail: karthari
        ? `Lagna is hemmed by hard natural malefics: 12th house (${h12.map(p => p.planet).join(', ')}) and 2nd house (${h2.map(p => p.planet).join(', ')}).`
        : 'No hard natural malefic is simultaneously present in both the 12th and 2nd houses from Lagna.',
    },
    {
      n: 4, name: 'Shashtashta Riphagatha Chandra', state: moonBadHouse ? 'present' : 'clear', severity: 'major',
      detail: moon ? `Moon is in house ${moon.house} from the election Lagna${moonBadHouse ? ' (6/8/12 defect detected)' : ''}.` : 'Moon position unavailable.',
    },
    {
      n: 5, name: 'Sagraha Chandra', state: moonConj.length ? 'present' : 'clear', severity: 'moderate',
      detail: moonConj.length
        ? `Moon shares ${moon?.rashi.name} with ${moonConj.map(p => p.planet).join(', ')}. This flags the classical same-rashi conjunction condition; exact angular/orb interpretation can be exposed as a tradition setting later.`
        : 'Moon does not share its Rashi with another graha.',
    },
    {
      n: 10, name: 'Bhrigu Shatka', state: venus?.house === 6 ? 'present' : 'clear', severity: 'major',
      detail: venus ? `Venus is in house ${venus.house} from the election Lagna.` : 'Venus position unavailable.',
    },
    {
      n: 11, name: 'Kujasthama', state: mars?.house === 8 ? 'present' : 'clear', severity: 'major',
      detail: mars ? `Mars is in house ${mars.house} from the election Lagna.` : 'Mars position unavailable.',
    },
  ];
}
