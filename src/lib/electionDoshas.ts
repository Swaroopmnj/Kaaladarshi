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
const RASHI_LORD = ['Mars', 'Venus', 'Mercury', 'Moon', 'Sun', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Saturn', 'Jupiter'];
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
  const karthari = h2.length > 0 && h12.length > 0;

  const moonBadHouse = !!moon && [6, 8, 12].includes(moon.house);
  const moonConj = moon
    ? chart.planets.filter((p) => p.planet !== 'Moon' && p.rashi.index === moon.rashi.index)
    : [];

  const results: ElectionDoshaCheck[] = [
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
      n: 5, name: 'Sagraha Chandra', state: moonConj.length ? 'present' : 'clear',
      severity: options.activityKey === 'vivah' ? 'major' : 'moderate',
      detail: moonConj.length
        ? `Moon shares ${moon?.rashi.name} with ${moonConj.map(p => p.planet).join(', ')}. B.V. Raman: "specially applicable in case of marriage" — treated as major here for Vivāha, moderate for other activities. Exact angular/orb interpretation can be exposed as a tradition setting later.`
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

  // #6 Udayasta Suddhi. Source: B.V. Raman, Muhurtha — "The Lagna should be
  // occupied by its own lord and the Navamsa Lagna by its own lord... the
  // seventh and the lord of the seventh Bhava should be favourably
  // disposed." We check the D1-only clause here (Lagna lord in Lagna, 7th
  // lord in the 7th) since it's the part directly computable from the whole-
  // sign D1 chart without ambiguity; the Navamsa mutual-aspect refinement
  // Raman also describes is a documented further nuance, not yet added.
  {
    const lagnaLordName = RASHI_LORD[chart.lagna.rashi.index];
    const lagnaLord = planet(chart, lagnaLordName);
    const lagnaLordStrong = lagnaLord?.house === 1;

    const house7RashiIdx = (chart.lagna.rashi.index + 6) % 12;
    const house7LordName = RASHI_LORD[house7RashiIdx];
    const house7Lord = planet(chart, house7LordName);
    const house7LordStrong = house7Lord?.house === 7;

    const bothWeak = !lagnaLordStrong && !house7LordStrong;
    results.push({
      n: 6, name: 'Udayasta Suddhi', state: bothWeak ? 'present' : 'clear', severity: 'moderate',
      detail: bothWeak
        ? `Neither the Lagna lord (${lagnaLordName}) occupies the Lagna, nor the 7th lord (${house7LordName}) occupies the 7th — B.V. Raman's Udayasta Suddhi test for a strong Lagna/7th is not met. Especially weighted for marriage elections.`
        : `${lagnaLordStrong ? `Lagna lord (${lagnaLordName}) occupies its own Lagna` : `7th lord (${house7LordName}) occupies its own 7th house`} — Udayasta Suddhi's core condition is met.`,
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
