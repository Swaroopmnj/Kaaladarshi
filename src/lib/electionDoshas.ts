import type { BirthChart, ShadbalaResult } from 'panchang-ts';

export type DoshaState = 'clear' | 'present' | 'not-evaluated';
export interface ElectionDoshaCheck {
  n: number;
  name: string;
  state: DoshaState;
  severity: 'major' | 'moderate' | 'info';
  detail: string;
}

const HARD_MALEFICS = new Set(['Sun', 'Mars', 'Saturn', 'Rahu', 'Ketu']);

// Classical (7-graha) rashi lordships. Rahu/Ketu own no sign in this system.
export const RASHI_LORD = ['Mars', 'Venus', 'Mercury', 'Moon', 'Sun', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Saturn', 'Jupiter'];
const MALEFIC_LORDED_RASHIS = new Set([0, 4, 7, 9, 10]); // Mesha/Simha/Vrischika (Mars/Sun/Mars), Makara/Kumbha (Saturn)

function planet(chart: BirthChart, name: string) {
  return chart.planets.find((p) => p.planet.toLowerCase() === name.toLowerCase());
}

export interface ElectionDoshaOptions {
  /** Which activity this election is for. Several Mahādoṣas are explicitly
   *  weighted stricter for marriage in the classical sources — e.g.
   *  vedastro.org's Muhurtha Ch.5 guide states Bhṛgu Ṣaṣṭha, Kujāṣṭama,
   *  Sagraha Chandra and Aṣṭama Lagna are "treated with zero tolerance in
   *  marriage charts," and B.V. Raman's Muhurtha notes Sagraha Chandra is
   *  "specially applicable in case of marriage." Passing the activity lets
   *  those four flag as 'major' (hard, score-zeroing) for vivah specifically
   *  and 'moderate' (flagged but not hard-blocking) for other activities,
   *  where the same textual basis doesn't apply with the same force. Omit
   *  to keep the previous uniform-severity behaviour.
   */
  activityKey?: string;
  /** The election moment's own Navamsa (D9) chart — enables Kunavamsa (#14). */
  navamsaLagnaRashiIndex?: number;
  /** The querent's (or, for marriage, either party's) NATAL Lagna rashi index
   *  from their own birth chart (Kundali tab) — enables Ashtama Lagna (#12).
   *  Requires the user to have generated a Kundali; without it this check
   *  stays "not-evaluated" rather than silently assuming clear. */
  natalLagnaRashiIndex?: number;
  /** Shadbala at the election moment — enables Papashadvarga (#9). */
  shadbala?: ShadbalaResult;
}

/**
 * Phase-2 election-chart checks that can be determined directly and
 * transparently from the D1/whole-sign chart returned by panchang-ts.
 *
 * IMPORTANT: this function DETECTS the underlying configuration only.
 * It does not silently apply a dosha-bhanga.  Cancellation/apavada is a
 * separate layer because it is activity- and textual-tradition-specific.
 */
export function evaluateElectionMahadoshas(chart: BirthChart, options: ElectionDoshaOptions = {}): ElectionDoshaCheck[] {
  const moon = planet(chart, 'Moon');
  const venus = planet(chart, 'Venus');
  const mars = planet(chart, 'Mars');

  const h2 = chart.planets.filter((p) => p.house === 2 && HARD_MALEFICS.has(p.planet));
  const h12 = chart.planets.filter((p) => p.house === 12 && HARD_MALEFICS.has(p.planet));
  const lagnaKarthari = h2.length > 0 && h12.length > 0;

  // Chandra Papakarthari — the same scissor-affliction pattern, but counted
  // from the transit MOON's rashi instead of the Lagna. Per Kalaprakasika,
  // this is considered equally destructive to Lagna Papakarthari for
  // Vivaha and Griha Pravesha in both North and South Indian tradition —
  // previously only the Lagna version was checked here, a real gap.
  const moonRashiIdx = moon?.rashi.index;
  const h2FromMoon = moonRashiIdx !== undefined
    ? chart.planets.filter((p) => p.rashi.index === (moonRashiIdx + 1) % 12 && HARD_MALEFICS.has(p.planet))
    : [];
  const h12FromMoon = moonRashiIdx !== undefined
    ? chart.planets.filter((p) => p.rashi.index === (moonRashiIdx + 11) % 12 && HARD_MALEFICS.has(p.planet))
    : [];
  const chandraKarthari = moonRashiIdx !== undefined && h2FromMoon.length > 0 && h12FromMoon.length > 0;
  const karthari = lagnaKarthari || chandraKarthari;

  const moonBadHouse = !!moon && [6, 8, 12].includes(moon.house);
  // Sagraha Chandra refined: same-RASHI presence isn't necessarily a real
  // conjunction — two planets can be 25° apart and technically share a
  // sign without being conjunct in any meaningful sense. Distinguish a
  // tight conjunction (within an 8° orb, a commonly used general
  // planetary-conjunction orb) from a loose same-rashi co-presence, and
  // only treat the tight case as the full dosha.
  const CONJUNCTION_ORB_DEGREES = 8;
  function angularSeparation(a: number, b: number): number {
    const diff = Math.abs(a - b) % 360;
    return diff > 180 ? 360 - diff : diff;
  }
  const moonSameRashi = moon
    ? chart.planets.filter((p) => p.planet !== 'Moon' && p.rashi.index === moon.rashi.index)
    : [];
  const moonTightConj = moon
    ? moonSameRashi.filter((p) => angularSeparation(p.longitude, moon.longitude) <= CONJUNCTION_ORB_DEGREES)
    : [];

  const results: ElectionDoshaCheck[] = [
    {
      n: 3, name: 'Karthari Dosha', state: karthari ? 'present' : 'clear', severity: 'major',
      detail: karthari
        ? [
            lagnaKarthari ? `Lagna hemmed by hard malefics: 12th house (${h12.map(p => p.planet).join(', ')}) and 2nd house (${h2.map(p => p.planet).join(', ')}).` : null,
            chandraKarthari ? `Chandra (transit Moon) hemmed by hard malefics: 12th-from-Moon (${h12FromMoon.map(p => p.planet).join(', ')}) and 2nd-from-Moon (${h2FromMoon.map(p => p.planet).join(', ')}) — per Kalaprakasika, equally destructive to the Lagna version for Vivaha/Griha Pravesha.` : null,
          ].filter(Boolean).join(' ')
        : 'Neither the Lagna nor the transit Moon is hemmed by hard natural malefics in the houses/signs on either side.',
    },
    {
      n: 4, name: 'Shashtashta Riphagatha Chandra', state: moonBadHouse ? 'present' : 'clear', severity: 'major',
      detail: moon ? `Moon is in house ${moon.house} from the election Lagna${moonBadHouse ? ' (6/8/12 defect detected)' : ''}.` : 'Moon position unavailable.',
    },
    {
      n: 5, name: 'Sagraha Chandra', state: moonTightConj.length ? 'present' : 'clear',
      severity: options.activityKey === 'vivah' ? 'major' : 'moderate',
      detail: moonTightConj.length
        ? `Moon is within ${CONJUNCTION_ORB_DEGREES}° of ${moonTightConj.map(p => `${p.planet} (${angularSeparation(p.longitude, moon!.longitude).toFixed(1)}°)`).join(', ')} — a true tight conjunction, not just same-rashi presence. B.V. Raman: "specially applicable in case of marriage" — treated as major here for Vivāha, moderate for other activities.`
        : moonSameRashi.length
          ? `Moon shares ${moon?.rashi.name} with ${moonSameRashi.map(p => `${p.planet} (${angularSeparation(p.longitude, moon!.longitude).toFixed(1)}° away)`).join(', ')}, but none are within the ${CONJUNCTION_ORB_DEGREES}° conjunction orb — not treated as a real Sagraha Chandra defect, just noted for transparency.`
          : 'Moon does not share its Rashi with another graha.',
    },
    {
      n: 10, name: 'Bhrigu Shatka', state: venus?.house === 6 ? 'present' : 'clear',
      severity: options.activityKey === 'vivah' ? 'major' : 'moderate',
      detail: venus ? `Venus is in house ${venus.house} from the election Lagna. Zero-tolerance for Vivāha per classical sourcing (Venus in 6th destroys marital harmony); treated as moderate for other activities.` : 'Venus position unavailable.',
    },
    {
      n: 11, name: 'Kujasthama', state: mars?.house === 8 ? 'present' : 'clear',
      severity: options.activityKey === 'vivah' ? 'major' : 'moderate',
      detail: mars ? `Mars is in house ${mars.house} from the election Lagna. Zero-tolerance for Vivāha per classical sourcing; treated as moderate for other activities.` : 'Mars position unavailable.',
    },
  ];

  if (options.natalLagnaRashiIndex !== undefined) {
    const count = ((chart.lagna.rashi.index - options.natalLagnaRashiIndex + 12) % 12) + 1;
    const present = count === 8;
    results.push({
      n: 12, name: 'Ashtama Lagna', state: present ? 'present' : 'clear',
      severity: options.activityKey === 'vivah' ? 'major' : 'moderate',
      detail: present
        ? `This election Lagna (${chart.lagna.rashi.name}) is the 8th house counted from your natal Lagna — zero-tolerance for Vivāha per classical sourcing, moderate for other activities.`
        : `This election Lagna is house ${count} from your natal Lagna, not the 8th — clear for you personally.`,
    });
  }

  if (options.navamsaLagnaRashiIndex !== undefined) {
    const lord = RASHI_LORD[options.navamsaLagnaRashiIndex];
    const present = MALEFIC_LORDED_RASHIS.has(options.navamsaLagnaRashiIndex);
    results.push({
      n: 14, name: 'Kunavamsa', state: present ? 'present' : 'clear', severity: 'moderate',
      detail: present
        ? `The Lagna's Navamsa falls in a sign ruled by a natural malefic (${lord}).`
        : `The Lagna's Navamsa falls in a sign ruled by ${lord}, not a natural malefic — clear.`,
    });
  }

  // #6 Udayasta Suddhi. Refined per Gemini's audit (checked plausible on its
  // own logical merits — it's a more careful reading of the same B.V. Raman
  // condition, not a claim needing separate external sourcing): Udaya
  // Suddhi requires the 1st house free of hard malefics; Asta Suddhi
  // requires the 7th house free of hard malefics. Separately, the Lagna
  // lord and 7th lord don't need to occupy their OWN sign — that was the
  // old, too-strict version, which produced false positives whenever a
  // lord was well-placed elsewhere (e.g. a kendra) but just not its own
  // sign. The correct softer check is only that the lords avoid the
  // trik houses (6th/8th/12th — houses of loss/disease/expense).
  {
    const h1Malefics = chart.planets.filter((p) => p.house === 1 && HARD_MALEFICS.has(p.planet));
    const h7Malefics = chart.planets.filter((p) => p.house === 7 && HARD_MALEFICS.has(p.planet));

    const lagnaLordName = RASHI_LORD[chart.lagna.rashi.index];
    const lagnaLord = planet(chart, lagnaLordName);
    const lagnaLordBad = !!lagnaLord && [6, 8, 12].includes(lagnaLord.house);

    const house7RashiIdx = (chart.lagna.rashi.index + 6) % 12;
    const house7LordName = RASHI_LORD[house7RashiIdx];
    const house7Lord = planet(chart, house7LordName);
    const house7LordBad = !!house7Lord && [6, 8, 12].includes(house7Lord.house);

    const defect = h1Malefics.length > 0 || h7Malefics.length > 0 || lagnaLordBad || house7LordBad;
    const parts = [
      h1Malefics.length > 0 ? `1st house has hard malefic(s) (${h1Malefics.map(p => p.planet).join(', ')})` : null,
      h7Malefics.length > 0 ? `7th house has hard malefic(s) (${h7Malefics.map(p => p.planet).join(', ')})` : null,
      lagnaLordBad ? `Lagna lord (${lagnaLordName}) falls in a trik house (${lagnaLord!.house})` : null,
      house7LordBad ? `7th lord (${house7LordName}) falls in a trik house (${house7Lord!.house})` : null,
    ].filter(Boolean);
    results.push({
      n: 6, name: 'Udayasta Suddhi', state: defect ? 'present' : 'clear', severity: 'moderate',
      detail: defect
        ? `${parts.join('; ')}. Especially weighted for marriage elections.`
        : '1st and 7th houses are free of hard malefics, and both lords avoid the 6th/8th/12th — Udayasta Suddhi is met.',
    });
  }

  // #9 Papashadvarga. Classical definition: malefics strong across six
  // divisional charts (a Shadvarga-specific strength sub-measure). We use
  // the library's native computeShadbala instead of re-deriving a varga
  // point table ourselves — it's a broader six-COMPONENT strength measure
  // (positional/directional/temporal/motional/natural/aspectual), not the
  // narrower six-CHART positional-only sub-component the classical name
  // technically refers to, but it is the most complete, authoritative
  // strength system directly available and a reasonable adapted proxy.
  // Threshold: 300 Virupas (5 Rupas) is the commonly cited general
  // sufficiency bar for a planet to be considered "strong."
  if (options.shadbala) {
    const HARD_MALEFIC_NAMES = ['Sun', 'Mars', 'Saturn'] as const;
    const strong = HARD_MALEFIC_NAMES
      .map((name) => ({ name, total: options.shadbala![name].total }))
      .filter((x) => x.total >= 300);
    results.push({
      n: 9, name: 'Papashadvarga', state: strong.length > 0 ? 'present' : 'clear', severity: 'moderate',
      detail: strong.length > 0
        ? `${strong.map(x => `${x.name} (${x.total.toFixed(0)} V)`).join(', ')} at/above the 300-Virupa strength bar — a strong hard malefic is generally undesirable in an election chart.`
        : `No hard malefic (Sun/Mars/Saturn) reaches the 300-Virupa strength bar at this moment.`,
    });
  }

  return results;
}
