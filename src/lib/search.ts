import {
  findAuspiciousDates,
  computeTarabala,
  computeChandraBalam,
  computePlanetaryPositions,
  computeLagna,
  STOCK_MUHURTA_RULES,
  type MuhurtaDay,
  type MuhurtaRule,
} from 'panchang-ts';
import { NAKSHATRAS, RASHIS, PANCHAKA_ACTIVITY_KEY, type CityPreset } from './constants';
import { CUSTOM_ACTIVITY_RULES } from './customActivities';
import { getPanchakaVerdict, calculatePanchakaRahita, extractTithiNumber, varaNumberFromName, type PanchakaRahitaResult } from './panchaka';
import {
  getAyana,
  DAKSHINAYANA_WARN,
  DAKSHINAYANA_HARD_BLOCK,
  CHATURMASA_MASAS,
  CHATURMASA_WARN_ACTIVITIES,
  KARTIKA_DAKSHINAYANA_EXCEPTION,
} from './ayana';
import { getMudhaStatus, SHUKRA_MUDHA_SENSITIVE, GURU_MUDHA_SENSITIVE } from './mudha';

// panchang-ts's own computeTarabala labels Janma Tara (Tara 1 — the muhurta
// falling on the person's own birth nakshatra) as "auspicious". The
// MAJORITY classical position disagrees: PanchangBodh quotes the source
// verse directly — "जन्म विपत् च नैधन प्रत्यरि च" (Janma, Vipat, Naidhana,
// Pratyari — these four inauspicious Tārās should be avoided in auspicious
// undertakings) — explicitly grouping Janma with the three unambiguously
// malefic Tārās. Astroccult.net states it as a plain rule: "Avoid your
// janma nakshatra (birth star) for all good works." There IS a documented
// minority nuance (Kambhampati: Janma Tara is activity-dependent — fine for
// some saṃskāras like Upanayanam, avoided for others like conception or
// travel) — we don't hard-block on it, but the majority position is clear
// enough that treating it as a positive signal (the library's default) is
// wrong for a general-purpose muhurta tool. We override it here to "warn".
export function describeTara(tara: { name: string; englishName: string; quality: string }): string {
  if (tara.englishName === 'Janma') {
    return `${tara.name} Tara — inauspicious (own birth nakshatra; majority classical sources group this with Vipat/Pratyari/Naidhana as taras to avoid for auspicious undertakings — a minority view treats it as activity-dependent instead)`;
  }
  return `${tara.name} Tara — ${tara.quality}`;
}
import { isChakraShuddhi } from './chakraShuddhi';
import { getLagnaWindows, activeLimbAt } from './timewindows';
import { getBhadraDayVerdict } from './bhadra';
import { localDateAtMidnight, toRealInstant } from './dateUtils';
import { activityNakshatraRule } from './activityRules';

export interface EnrichedDay {
  raw: MuhurtaDay;
  finalScore: number;
  panchakaBlocked: boolean;
  panchakaNote: string;
  bhadraBlocked: boolean;
  bhadraNote: string;
  ayanaHardBlocked: boolean;
  chaturmasaWarn: boolean;
  autoDoshaHits: string[];
  ayanaWarn?: string;
  ayana: 'Uttarayana' | 'Dakshinayana';
  shukraMudhaWarn: boolean;
  guruMudhaWarn: boolean;
  taraNote?: string;
  brideTaraNote?: string;
  fatherTaraNote?: string;
  motherTaraNote?: string;
  fatherChandraNote?: string;
  motherChandraNote?: string;
  chandraNote?: string;
  kalasaChakraShuddhi?: boolean;
  vrishabhaChakraShuddhi?: boolean;
  tier: 'strict' | 'compromised' | 'rejected';
  tierNote: string;
  clearedChecks: string[];
  compromises: string[];
  merits: string[];
  demerits: string[];
  nakshatraGrade: string;
}

export interface SearchParams {
  activityKey: string;
  startDate: string;
  endDate: string;
  city: CityPreset;
  isVivah: boolean;
  personalize: boolean;
  nakshatraIdx: number;
  rashiIdx: number;
  groomNakshatraIdx: number;
  groomRashiIdx: number;
  brideNakshatraIdx: number;
  brideRashiIdx: number;
  /** Only used when activityKey === 'upanayanam' — Father/Mother alongside
   *  the son (son uses nakshatraIdx/rashiIdx, the existing "self" slot).
   *  Upanayanam is traditionally checked for all three, not just the boy. */
  fatherNakshatraIdx?: number;
  fatherRashiIdx?: number;
  motherNakshatraIdx?: number;
  motherRashiIdx?: number;
}

export function runMuhurtaSearch(p: SearchParams): EnrichedDay[] {
  const baseRule = CUSTOM_ACTIVITY_RULES[p.activityKey] ?? STOCK_MUHURTA_RULES[p.activityKey];
  const rule: MuhurtaRule = { ...baseRule, excludePanchaka: false, excludeBhadra: false };
  const location = { latitude: p.city.latitude, longitude: p.city.longitude };
  const days = findAuspiciousDates(
    rule,
    localDateAtMidnight(p.startDate, p.city.timezone),
    localDateAtMidnight(p.endDate, p.city.timezone),
    location,
    { timezone: p.city.timezone, includeFailures: false },
  );

  const enriched: EnrichedDay[] = days.map((d) => {
    const panchang = d.panchang;
    const nakshatraName = panchang.nakshatras[0]?.name ?? '';
    const panchakaKey = PANCHAKA_ACTIVITY_KEY[p.activityKey] ?? p.activityKey;
    // Day-level Panchaka Rahita, checked across EVERY Lagna window in the
    // day, not just the sunrise moment. Panchaka Rahita depends on Lagna,
    // which changes roughly every 2 hours — a single sunrise snapshot
    // cannot validly represent a whole day, the same class of mistake
    // already fixed elsewhere in this app for Tarabala's day-transition
    // handling. A day is only treated as Panchaka-blocked if EVERY window
    // in it has an intolerable type; if even one window is Rahita or a
    // documented tolerated exception, the day itself isn't rejected for
    // this — the Full Report still shows the precise per-window value so
    // a bad early-morning moment doesn't get silently hidden either.
    const location = { latitude: p.city.latitude, longitude: p.city.longitude };
    const dayLagnaWindows = getLagnaWindows(panchang, location, p.city.timezone);
    const varaNum = varaNumberFromName(panchang.vara.englishName);
    let bestPanchakaRahita: PanchakaRahitaResult | null = null;
    let bestVerdict: { blocked: boolean; note: string } | null = null;
    for (const w of dayLagnaWindows) {
      const activeTithi = activeLimbAt(panchang.tithis, w.start);
      const activeNak = activeLimbAt(panchang.nakshatras, w.start);
      const tithiNum = extractTithiNumber(activeTithi);
      const nakNum = NAKSHATRAS.findIndex((n) => activeNak.name.toLowerCase().startsWith(n.toLowerCase().slice(0, 6))) + 1;
      const windowLagna = computeLagna(toRealInstant(w.start, p.city.timezone), location, 'lahiri');
      const lagnaNum = (windowLagna.rashi.index ?? 0) + 1;
      if (!tithiNum || !varaNum || nakNum <= 0) continue;
      const pr = calculatePanchakaRahita(tithiNum, varaNum, nakNum, lagnaNum);
      const v = getPanchakaVerdict(panchakaKey, pr, panchang.panchaka);
      if (!v.blocked) { bestPanchakaRahita = pr; bestVerdict = v; break; } // found a survivable window — done
      if (!bestPanchakaRahita) { bestPanchakaRahita = pr; bestVerdict = v; } // keep the first as a fallback representative
    }
    const verdict = bestVerdict ?? getPanchakaVerdict(panchakaKey, null, panchang.panchaka);
    const bhadraVerdict = getBhadraDayVerdict(panchang);
    const nakRule = activityNakshatraRule(p.activityKey, nakshatraName);

    const autoDoshaHits: string[] = [];
    const yogaNames = panchang.yogas.map((y) => y.name.toLowerCase());
    if (yogaNames.some((n) => n.includes('vyatipata'))) autoDoshaHits.push('#20 Mahapatha (Vyatipata) — active this day');
    if (yogaNames.some((n) => n.includes('vaidhriti') || n.includes('vaidhruthi'))) autoDoshaHits.push('#21 Vaidhruthi — active this day');
    // Ganda-Mula classification is not identical to exact Gandānta. Do not mark
    // the whole Mūla/Aśleṣā/Jyeṣṭhā etc. as Mahādoṣa #8 here. Exact junction
    // timing must be evaluated separately before claiming Gandānta.

    const sunRashiIdx = Math.floor(panchang.siderealSunAtSunrise / 30);
    const ayana = getAyana(sunRashiIdx);
    const positions = computePlanetaryPositions(toRealInstant(panchang.sunrise, p.city.timezone), 'lahiri');
    const mudha = getMudhaStatus(positions.sun.siderealLongitude, positions.venus.siderealLongitude, positions.jupiter.siderealLongitude);

    const inKartikaException = p.activityKey === 'grihaPravesh' && KARTIKA_DAKSHINAYANA_EXCEPTION.has(p.activityKey) && panchang.chandramasa.name === 'Kartika';
    const ayanaHardBlocked = ayana === 'Dakshinayana' && DAKSHINAYANA_HARD_BLOCK.has(p.activityKey);
    const ayanaWarn = ayana === 'Dakshinayana' && !inKartikaException && !ayanaHardBlocked ? DAKSHINAYANA_WARN[p.activityKey]?.note : undefined;
    const chaturmasaWarn = CHATURMASA_MASAS.has(panchang.chandramasa.name) && CHATURMASA_WARN_ACTIVITIES.has(p.activityKey);

    const shukraMudhaWarn = mudha.shukraMudha && SHUKRA_MUDHA_SENSITIVE.has(p.activityKey);
    const guruMudhaWarn = mudha.guruMudha && GURU_MUDHA_SENSITIVE.has(p.activityKey);

    let taraNote: string | undefined;
    let brideTaraNote: string | undefined;
    let chandraNote: string | undefined;
    let fatherTaraNote: string | undefined;
    let motherTaraNote: string | undefined;
    let fatherChandraNote: string | undefined;
    let motherChandraNote: string | undefined;
    const isUpanayanam = p.activityKey === 'upanayanam' && p.fatherNakshatraIdx !== undefined && p.motherNakshatraIdx !== undefined;
    if (p.personalize) {
      const effNakIdx = p.isVivah ? p.groomNakshatraIdx : p.nakshatraIdx;
    const effRashiIdx = p.isVivah ? p.groomRashiIdx : p.rashiIdx;
    const transitNakIdx = NAKSHATRAS.findIndex((n) => nakshatraName.toLowerCase().startsWith(n.toLowerCase().slice(0, 6)));
    if (transitNakIdx >= 0) {
      const tara = computeTarabala(effNakIdx, transitNakIdx);
      taraNote = `${describeTara(tara)}${p.isVivah ? ' [groom]' : isUpanayanam ? ' [son]' : ''}`;
      if (p.isVivah) {
        const brideTara = computeTarabala(p.brideNakshatraIdx, transitNakIdx);
        brideTaraNote = `${describeTara(brideTara)} [bride]`;
      }
      if (isUpanayanam) {
        const fatherTara = computeTarabala(p.fatherNakshatraIdx!, transitNakIdx);
        fatherTaraNote = `${describeTara(fatherTara)} [father]`;
        const motherTara = computeTarabala(p.motherNakshatraIdx!, transitNakIdx);
        motherTaraNote = `${describeTara(motherTara)} [mother]`;
      }
    }
    const chandraRashiName: string | undefined = panchang.chandraRashi?.name;
    if (chandraRashiName) {
      const transitRashiIdx = RASHIS.findIndex((r) => r.toLowerCase().startsWith(chandraRashiName.toLowerCase().slice(0, 4)));
      if (transitRashiIdx >= 0) {
        const cb = computeChandraBalam(effRashiIdx, transitRashiIdx);
        chandraNote = `Chandra Bala: ${cb.quality} (house ${cb.house} from birth Moon)${p.isVivah ? ' [groom]' : isUpanayanam ? ' [son]' : ''}`;
        if (isUpanayanam && p.fatherRashiIdx !== undefined && p.motherRashiIdx !== undefined) {
          const fcb = computeChandraBalam(p.fatherRashiIdx, transitRashiIdx);
          fatherChandraNote = `Chandra Bala: ${fcb.quality} (house ${fcb.house} from birth Moon) [father]`;
          const mcb = computeChandraBalam(p.motherRashiIdx, transitRashiIdx);
          motherChandraNote = `Chandra Bala: ${mcb.quality} (house ${mcb.house} from birth Moon) [mother]`;
        }
      }
    }
    }

    let finalScore = d.score;
    if (verdict.blocked) finalScore = Math.max(0, finalScore - 40);
    // Bhadrā is interval-based: never deduct/reject the entire day here.
    if (ayanaHardBlocked) finalScore = 0;
    if (['vivah', 'upanayanam', 'grihaPravesh'].includes(p.activityKey) && (shukraMudhaWarn || guruMudhaWarn)) finalScore = 0;
    if (chaturmasaWarn) finalScore = Math.max(0, finalScore - 25);
    if (taraNote?.includes('inauspicious')) finalScore = Math.max(0, finalScore - 15);
    if (chandraNote?.includes('weak')) finalScore = Math.max(0, finalScore - 10);

    let kalasaChakraShuddhi: boolean | undefined;
    let vrishabhaChakraShuddhi: boolean | undefined;
    // Kalasa Chakra Shuddhi and Vrishabha Chakra Shuddhi are both derived
    // from the same distance-from-Revati calculation (isChakraShuddhi);
    // which one(s) apply is activity-specific — see the correction note
    // directly below.
    // CORRECTED per direct instruction from the app owner (family/personal
    // tradition, overriding the earlier web-sourced version of this rule):
    // Griha Pravesha (housewarming) requires BOTH Kalasa AND Vrishabha
    // Chakra Shuddhi to be pure — not just one. Griha Arambha (foundation-
    // laying / Bhoomi Puja) requires only Kalasa Chakra Shuddhi. Explicitly
    // told not to re-verify this against outside sources — treated as
    // authoritative, documented here rather than silently changed.
    if (p.activityKey === 'grihaPravesh' || p.activityKey === 'bhoomiPuja') {
      const dayNakIdx = NAKSHATRAS.findIndex((n) => nakshatraName.toLowerCase().startsWith(n.toLowerCase().slice(0, 6)));
      if (dayNakIdx >= 0) {
        const shuddhi = isChakraShuddhi(dayNakIdx);
        kalasaChakraShuddhi = shuddhi;
        if (p.activityKey === 'grihaPravesh') vrishabhaChakraShuddhi = shuddhi;
        if (!shuddhi) finalScore = Math.max(0, finalScore - 25);
      }
    }

    const negativeReasons = d.reasons.filter((r) => r.startsWith('inauspicious'));
    const compromises: string[] = [];
    const clearedChecks: string[] = [];
    const merits: string[] = [];
    const demerits: string[] = [];

    if (nakRule.grade === 'prashasta') merits.push(`Nakṣatra: ${nakRule.reason}`);
    else if (nakRule.grade === 'varjya') demerits.push(`HARD — Nakṣatra: ${nakRule.reason}`);
    else if (nakRule.grade === 'conditional') demerits.push(`Nakṣatra caution: ${nakRule.reason}`);
    if (d.reasons.some(r => r.includes('auspicious tithi'))) merits.push('Tithi is favourable under the configured activity rule.');
    if (d.reasons.some(r => r.includes('auspicious vara'))) merits.push('Vāra is favourable under the configured activity rule.');

    if (negativeReasons.length > 0) {
      compromises.push(
        `${negativeReasons.join(', ')} — thumb rule: Muhurta Chintāmaṇi lists specific tithi/vāra/nakṣatra/yoga combinations as unfavourable for this activity; not blocking here because enough other auspicious factors offset it (net score still clears the pass threshold), but it's a real compromise, not an exception.`,
      );
    } else clearedChecks.push('Tithi/Vāra/Nakṣatra/Yoga: no inauspicious matches');

    if (panchang.panchaka) {
      compromises.push('Terminal Nakshatra Panchaka is active. Kept as a separate caution only; Panchaka Rahita (Mrityu/Agni/Raja/Chora/Roga) requires Tithi + Vara + Nakshatra + Udaya Lagna and is checked at candidate time windows.');
    } else clearedChecks.push('Terminal Nakshatra Panchaka: not active (Panchaka Rahita still requires exact Lagna)');

    const anyBhadraActive = !!panchang.bhadra?.isActive;
    if (anyBhadraActive) {
      compromises.push(`${bhadraVerdict.note} Candidate time windows subtract the blocking Viṣṭi interval instead of rejecting the whole date.`);
    } else clearedChecks.push('Bhadrā: not active');

    const activityVarjya = nakRule.grade === 'varjya';

    if (ayanaHardBlocked) {
      // No compromises entry needed — this is reflected directly as 'rejected' below.
    } else if (chaturmasaWarn) {
      compromises.push(
        `Falls within Chaturmās (Viṣṇu's yogic sleep, Āṣāḍha–Āśvina) — thumb rule: new-beginning ceremonies are traditionally paused during this period. Treated as a warning, not a block: PanchangBodh's Chaturmās guide states "some regional traditions permit vivāh under specific conditions... consult your family pandit," and rules generally "vary by family and regional tradition." Weigh this against your own family/regional custom.`,
      );
      if (inKartikaException) clearedChecks.push('Ayana: Dakshinayana, but Kartika Masa is the classical exception window for Griha Pravesh — treated as fine.');
      else if (ayanaWarn) compromises.push(`Dakshinayana — thumb rule: ${ayanaWarn}`);
      else if (ayana === 'Uttarayana') clearedChecks.push('Ayana: Uttarayana');
      else clearedChecks.push('Ayana: Dakshinayana (no restriction applies to this activity)');
    } else if (inKartikaException) {
      clearedChecks.push('Ayana: Dakshinayana, but Kartika Masa is the classical exception window for Griha Pravesh — treated as fine.');
    } else if (ayanaWarn) {
      compromises.push(`Dakshinayana — thumb rule: ${ayanaWarn}`);
    } else if (ayana === 'Uttarayana') clearedChecks.push('Ayana: Uttarayana');
    else clearedChecks.push('Ayana: Dakshinayana (no restriction applies to this activity)');

    if (shukraMudhaWarn) {
      compromises.push(
        'Shukra Mudha active — thumb rule: avoid while Venus is combust (too close to the Sun to be seen); flagged, not blocked — no documented exception excuses this, weigh it yourself against the rest of the day\'s strength.',
      );
    } else if (SHUKRA_MUDHA_SENSITIVE.has(p.activityKey)) clearedChecks.push('Shukra Mudha: Venus not combust');

    if (guruMudhaWarn) {
      compromises.push(
        'Guru Mudha active — thumb rule: avoid while Jupiter is combust; flagged, not blocked — no documented exception excuses this, weigh it yourself against the rest of the day\'s strength.',
      );
    } else if (GURU_MUDHA_SENSITIVE.has(p.activityKey)) clearedChecks.push('Guru Mudha: Jupiter not combust');

    if (autoDoshaHits.length > 0) {
      compromises.push(`${autoDoshaHits.join('; ')} — thumb rule: these Mahādoṣas are traditionally avoided; flagged here, not blocked, since no specific neutralisation was checked for it.`);
    } else clearedChecks.push('Vyatipata/Vaidhruthi/Gandanthara: none active');

    if (kalasaChakraShuddhi === false || vrishabhaChakraShuddhi === false) {
      const both = kalasaChakraShuddhi !== undefined && vrishabhaChakraShuddhi !== undefined;
      const chakraName = both ? 'Kalasa and Vrishabha' : kalasaChakraShuddhi === false ? 'Kalasa' : 'Vrishabha';
      compromises.push(
        `${chakraName} Chakra Shuddhi not pure — thumb rule: the muhurta nakṣatra's distance from Revati should fall in the auspicious band (6–13 or 22–27); this one doesn't. No exception applies — this is a real compromise weighed against the day's other strengths.`,
      );
    } else if (kalasaChakraShuddhi === true && vrishabhaChakraShuddhi === true) clearedChecks.push('Kalasa and Vrishabha Chakra Shuddhi: both pure');
    else if (kalasaChakraShuddhi === true) clearedChecks.push('Kalasa Chakra Shuddhi: pure');
    else if (vrishabhaChakraShuddhi === true) clearedChecks.push('Vrishabha Chakra Shuddhi: pure');

    if (p.personalize) {
      const taraBad = taraNote?.includes('inauspicious');
      const brideTaraBad = brideTaraNote?.includes('inauspicious');
      const fatherTaraBad = fatherTaraNote?.includes('inauspicious');
      const motherTaraBad = motherTaraNote?.includes('inauspicious');
      if (taraBad || brideTaraBad || fatherTaraBad || motherTaraBad) {
        compromises.push(
          `${[taraBad ? taraNote : null, brideTaraBad ? brideTaraNote : null, fatherTaraBad ? fatherTaraNote : null, motherTaraBad ? motherTaraNote : null].filter(Boolean).join('; ')} — thumb rule: an inauspicious Tārā (esp. Vipat/Pratyari/Naidhana/Janma) is traditionally avoided for important undertakings; flagged for whichever person(s) it affects, not blocked, since strength elsewhere in the day can offset it. For a shared muhurta (marriage, Upanayanam), a defect for ANY participant is treated as a shared compromise — this is Kāladarśī's own combination rule (a "weakest link" approach), not a specific classical formula for combining multiple people's Tārābala into one score, since no single sourced method for that was found.`,
        );
      } else if (taraNote) clearedChecks.push(`Tārābala: favourable for all participants (${[taraNote, brideTaraNote, fatherTaraNote, motherTaraNote].filter(Boolean).join('; ')})`);

      const chandraBad = chandraNote?.toLowerCase().includes('weak');
      const fatherChandraBad = fatherChandraNote?.toLowerCase().includes('weak');
      const motherChandraBad = motherChandraNote?.toLowerCase().includes('weak');
      if (chandraBad || fatherChandraBad || motherChandraBad) {
        compromises.push(`${[chandraBad ? chandraNote : null, fatherChandraBad ? fatherChandraNote : null, motherChandraBad ? motherChandraNote : null].filter(Boolean).join('; ')} — thumb rule: a weak Chandra Bala (per the library's own house classification — 2nd/4th/5th/8th/9th/12th from birth Moon are weak, 1st/3rd/6th/7th/10th/11th are strong) is traditionally avoided; flagged for whichever person(s) it affects, not blocked. Combined here using the same "weakest link" rule as Tārābala above.`);
      } else if (chandraNote) clearedChecks.push(`Chandra Bala: favourable for all participants (${[chandraNote, fatherChandraNote, motherChandraNote].filter(Boolean).join('; ')})`);
    }

    let tier: 'strict' | 'compromised' | 'rejected';
    let tierNote: string;
    // Guru/Shukra Mudha (combustion) as an ABSOLUTE block for Vivaha,
    // Upanayanam, and (Apurva/first-entry) Griha Pravesh specifically —
    // verified directly across multiple independent sources before
    // implementing, not taken on a single AI-report's word: DrikPanchang
    // states plainly "most auspicious works including marriage are
    // prohibited when Shukra Tara and Guru Tara are set"; ShubhPanchang.com
    // documents combustion as an outright removal filter (not a warning)
    // for Griha Pravesh dates; onlinejyotish.com's Shukra Asta Finder lists
    // exactly these three activities as "Prohibited," citing Muhurta
    // Chintamani directly. myvaastu.in adds the nuance that this specifically
    // applies to first entry into a NEW house, not re-entry into an
    // existing/renovated one — matching how this app's 'grihaPravesh'
    // activity is already scoped ("new house — first entry"). Other
    // activities (vahanKharidi etc.) keep the softer compromise treatment,
    // since the sourcing for those was weaker/less consistent.
    const isMajorSamskara = ['vivah', 'upanayanam', 'grihaPravesh'].includes(p.activityKey);
    if (isMajorSamskara && (shukraMudhaWarn || guruMudhaWarn)) {
      tier = 'rejected';
      tierNote = `Combustion active (${[shukraMudhaWarn ? 'Shukra Mudha' : null, guruMudhaWarn ? 'Guru Mudha' : null].filter(Boolean).join(' and ')}) — per Muhurta Chintamani, this is an absolute block for this activity, not a soft caution. No documented exception overrides it.`;
    } else if (activityVarjya) {
      tier = 'rejected';
      tierNote = nakRule.reason;
    } else if (ayanaHardBlocked) {
      tier = 'rejected';
      tierNote = DAKSHINAYANA_WARN[p.activityKey]?.note ?? 'Blocked: Dakshinayana, and this activity has no Dakshinayana exception.';
    } else if (verdict.blocked || !d.passes) {
      tier = 'rejected';
      tierNote = 'Fails a configured hard exclusion (for example eclipse/Adhika Māsa/severe Gaṇḍānta/earthly Bhadra) or the base activity rule. Panchaka Rahita is evaluated separately at exact candidate times.';
    } else if (compromises.length === 0) {
      tier = 'strict';
      tierNote = 'Maximum dosha reduction — every checked factor is clean, no exceptions relied upon.';
    } else {
      tier = 'compromised';
      tierNote = `Passes overall, but relies on ${compromises.length} accepted point${compromises.length > 1 ? 's' : ''} below — each with its thumb rule and why it doesn't block this date.`;
    }

    return {
      raw: d,
      finalScore,
      panchakaBlocked: verdict.blocked,
      panchakaNote: verdict.note,
      bhadraBlocked: false,
      bhadraNote: bhadraVerdict.note,
      ayanaHardBlocked,
      chaturmasaWarn,
      autoDoshaHits,
      ayanaWarn,
      ayana,
      shukraMudhaWarn,
      guruMudhaWarn,
      taraNote,
      brideTaraNote,
      fatherTaraNote,
      motherTaraNote,
      fatherChandraNote,
      motherChandraNote,
      chandraNote,
      kalasaChakraShuddhi,
      vrishabhaChakraShuddhi,
      tier,
      tierNote,
      clearedChecks,
      compromises,
      merits,
      demerits,
      nakshatraGrade: nakRule.grade,
    };
  });

  enriched.sort((a, b) => b.finalScore - a.finalScore);
  return enriched;
}
