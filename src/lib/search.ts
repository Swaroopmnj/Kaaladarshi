import {
  findAuspiciousDates,
  computeTarabala,
  computeChandraBalam,
  computePlanetaryPositions,
  STOCK_MUHURTA_RULES,
  type MuhurtaDay,
  type MuhurtaRule,
} from 'panchang-ts';
import { NAKSHATRAS, RASHIS, PANCHAKA_ACTIVITY_KEY, type CityPreset } from './constants';
import { panchakaTypeFromNakshatra, getPanchakaVerdict } from './panchaka';
import {
  getAyana,
  DAKSHINAYANA_WARN,
  DAKSHINAYANA_HARD_BLOCK,
  CHATURMASA_MASAS,
  CHATURMASA_BLOCKED_ACTIVITIES,
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
  chaturmasaBlocked: boolean;
  autoDoshaHits: string[];
  ayanaWarn?: string;
  ayana: 'Uttarayana' | 'Dakshinayana';
  shukraMudhaWarn: boolean;
  guruMudhaWarn: boolean;
  taraNote?: string;
  brideTaraNote?: string;
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
}

export function runMuhurtaSearch(p: SearchParams): EnrichedDay[] {
  const rule: MuhurtaRule = { ...STOCK_MUHURTA_RULES[p.activityKey], excludePanchaka: false, excludeBhadra: false };
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
    const type = panchakaTypeFromNakshatra(nakshatraName);
    const panchakaKey = PANCHAKA_ACTIVITY_KEY[p.activityKey] ?? p.activityKey;
    const verdict = getPanchakaVerdict(panchakaKey, panchang.panchaka, type);
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
    const chaturmasaBlocked = CHATURMASA_MASAS.has(panchang.chandramasa.name) && CHATURMASA_BLOCKED_ACTIVITIES.has(p.activityKey);

    const shukraMudhaWarn = mudha.shukraMudha && SHUKRA_MUDHA_SENSITIVE.has(p.activityKey);
    const guruMudhaWarn = mudha.guruMudha && GURU_MUDHA_SENSITIVE.has(p.activityKey);

    let taraNote: string | undefined;
    let brideTaraNote: string | undefined;
    let chandraNote: string | undefined;
    if (p.personalize) {
      const effNakIdx = p.isVivah ? p.groomNakshatraIdx : p.nakshatraIdx;
    const effRashiIdx = p.isVivah ? p.groomRashiIdx : p.rashiIdx;
    const transitNakIdx = NAKSHATRAS.findIndex((n) => nakshatraName.toLowerCase().startsWith(n.toLowerCase().slice(0, 6)));
    if (transitNakIdx >= 0) {
      const tara = computeTarabala(effNakIdx, transitNakIdx);
      taraNote = `${describeTara(tara)}${p.isVivah ? ' [groom]' : ''}`;
      if (p.isVivah) {
        const brideTara = computeTarabala(p.brideNakshatraIdx, transitNakIdx);
        brideTaraNote = `${describeTara(brideTara)} [bride]`;
      }
    }
    const chandraRashiName: string | undefined = panchang.chandraRashi?.name;
    if (chandraRashiName) {
      const transitRashiIdx = RASHIS.findIndex((r) => r.toLowerCase().startsWith(chandraRashiName.toLowerCase().slice(0, 4)));
      if (transitRashiIdx >= 0) {
        const cb = computeChandraBalam(effRashiIdx, transitRashiIdx);
        chandraNote = `Chandra Bala: ${cb.quality} (house ${cb.house} from birth Moon)${p.isVivah ? ' [groom]' : ''}`;
      }
    }
    }

    let finalScore = d.score;
    if (verdict.blocked) finalScore = Math.max(0, finalScore - 40);
    // Bhadrā is interval-based: never deduct/reject the entire day here.
    if (ayanaHardBlocked) finalScore = 0;
    if (chaturmasaBlocked) finalScore = 0;
    if (taraNote?.includes('inauspicious')) finalScore = Math.max(0, finalScore - 15);
    if (chandraNote?.includes('weak')) finalScore = Math.max(0, finalScore - 10);

    let kalasaChakraShuddhi: boolean | undefined;
    let vrishabhaChakraShuddhi: boolean | undefined;
    if (p.activityKey === 'grihaPravesh') {
      const dayNakIdx = NAKSHATRAS.findIndex((n) => nakshatraName.toLowerCase().startsWith(n.toLowerCase().slice(0, 6)));
      if (dayNakIdx >= 0) {
        const shuddhi = isChakraShuddhi(dayNakIdx);
        kalasaChakraShuddhi = shuddhi;
        vrishabhaChakraShuddhi = shuddhi;
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
    } else if (chaturmasaBlocked) {
      // Also reflected as 'rejected' below.
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
      compromises.push(
        'Chakra Shuddhi not pure — thumb rule: the muhurta nakṣatra\'s distance from Revati should fall in the auspicious band (6–13 or 22–27); this one doesn\'t. No exception applies — this is a real compromise weighed against the day\'s other strengths.',
      );
    } else if (kalasaChakraShuddhi === true) clearedChecks.push('Kalasa/Vrishabha Chakra Shuddhi: pure');

    if (p.personalize) {
      const taraBad = taraNote?.includes('inauspicious');
      const brideTaraBad = brideTaraNote?.includes('inauspicious');
      if (taraBad || brideTaraBad) {
        compromises.push(
          `${[taraBad ? taraNote : null, brideTaraBad ? brideTaraNote : null].filter(Boolean).join('; ')} — thumb rule: an inauspicious Tārā (esp. Vipat/Pratyari/Naidhana/Janma) is traditionally avoided for important undertakings; flagged, not blocked, since strength elsewhere in the day can offset it.`,
        );
      } else if (taraNote) clearedChecks.push(`Tārābala: favourable (${taraNote})`);

      const chandraBad = chandraNote?.toLowerCase().includes('weak');
      if (chandraBad) {
        compromises.push(`${chandraNote} — thumb rule: a weak Chandra Bala (per the library's own house classification — 2nd/4th/5th/8th/9th/12th from birth Moon are weak, 1st/3rd/6th/7th/10th/11th are strong) is traditionally avoided; flagged, not blocked.`);
      } else if (chandraNote) clearedChecks.push(`Chandra Bala: favourable (${chandraNote})`);
    }

    let tier: 'strict' | 'compromised' | 'rejected';
    let tierNote: string;
    if (activityVarjya) {
      tier = 'rejected';
      tierNote = nakRule.reason;
    } else if (ayanaHardBlocked) {
      tier = 'rejected';
      tierNote = DAKSHINAYANA_WARN[p.activityKey]?.note ?? 'Blocked: Dakshinayana, and this activity has no Dakshinayana exception.';
    } else if (chaturmasaBlocked) {
      tier = 'rejected';
      tierNote = 'Falls within Chaturmas (Vishnu\'s yogic sleep, Ashadha–Ashwina) — Vivaha, Griha Pravesh, and Upanayanam are traditionally paused entirely during this window.';
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
      chaturmasaBlocked,
      autoDoshaHits,
      ayanaWarn,
      ayana,
      shukraMudhaWarn,
      guruMudhaWarn,
      taraNote,
      brideTaraNote,
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
