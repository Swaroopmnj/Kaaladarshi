import type { MuhurtaRule } from 'panchang-ts';

// Nakshatra indices, 0-based, Ashwini=0..Revati=26 (matches panchang-ts).
const N = {
  Rohini: 3, Mrigashira: 4, Pushya: 7, Hasta: 12, Chitra: 13, Swati: 14, Anuradha: 16,
  UttaraPhalguni: 11, UttaraAshadha: 20, Shravana: 21, Dhanishtha: 22, Shatabhisha: 23,
  UttaraBhadrapada: 25, Revati: 26,
};

// Tithi indices, 0-based: 0=Shukla Pratipada .. 14=Purnima, 15=Krishna Pratipada .. 29=Amavasya.
const T = {
  shuklaDwitiya: 1, shuklaTritiya: 2, shuklaPanchami: 4, shuklaSaptami: 6, shuklaDashami: 9,
  shuklaEkadashi: 10, shuklaTrayodashi: 12,
  shuklaChaturthi: 3, shuklaNavami: 8, shuklaChaturdashi: 13,
  krishnaChaturthi: 18, krishnaNavami: 23, krishnaChaturdashi: 28,
  amavasya: 29,
};

/**
 * Bhūmi Pūjā / foundation-laying — a genuinely distinct activity from Griha
 * Praveśa (move-in), performed before excavation begins. Sourced and
 * cross-verified across ~8 independent modern panchang/Vastu sources
 * (Housivity, NoBroker, AstroShastra, 99Pandit, SmartPuja, Ishvaram,
 * Savitar Realty, Wallsanddreams) which converge closely on:
 *   - Favourable nakṣatras: Rohini, Mrigashira, Uttara Phalguni, Uttara
 *     Ashadha, Uttara Bhadrapada, Hasta, Chitra, Swati, Anuradha, Pushya,
 *     Shravana, Dhanishtha, Revati, Shatabhisha.
 *   - Favourable tithis (Shukla Pakṣa emphasised): 2, 3, 5, 7, 10, 11, 13.
 *     Avoid 4th, 9th, 14th, and Amavasya.
 *   - Favourable vāra: Monday, Wednesday, Thursday, Friday (Thursday/Guru
 *     most cited as best).
 *   - Avoid Chaturmās, Panchaka (strictly, per Ishvaram), Bhadra, eclipse.
 *   - Sthira (fixed) Lagna preferred — already covered by this app's
 *     existing Lagna-suitability layer, not duplicated here.
 */
export const BHOOMI_PUJA_RULE: MuhurtaRule = {
  occasion: 'bhoomiPuja',
  name: 'Bhoomi Puja (Foundation laying)',
  auspiciousTithis: [T.shuklaDwitiya, T.shuklaTritiya, T.shuklaPanchami, T.shuklaSaptami, T.shuklaDashami, T.shuklaEkadashi, T.shuklaTrayodashi],
  inauspiciousTithis: [T.shuklaChaturthi, T.shuklaNavami, T.shuklaChaturdashi, T.krishnaChaturthi, T.krishnaNavami, T.krishnaChaturdashi, T.amavasya],
  auspiciousNakshatras: [N.Rohini, N.Mrigashira, N.UttaraPhalguni, N.UttaraAshadha, N.UttaraBhadrapada, N.Hasta, N.Chitra, N.Swati, N.Anuradha, N.Pushya, N.Shravana, N.Dhanishtha, N.Revati, N.Shatabhisha],
  auspiciousVaras: [1, 3, 4, 5],
  excludeBhadra: true,
  excludeEkadashi: false,
  excludeAdhikaMasa: true,
  excludeEclipse: true,
  excludeGandaMula: true,
  excludePanchaka: true,
};

/**
 * Home Buying — narrowed to REGISTRATION / sale-deed specifically. Advance
 * payment and Agreement signing used to be sub-stages nested here, but per
 * user feedback they apply identically whether you're buying a car, a
 * home, land, or anything else — so they've been pulled out into their own
 * universal ADVANCE_PAYMENT_RULE / AGREEMENT_SIGNING_RULE below, shared
 * across purchase types rather than duplicated per activity. Registration
 * stays property-specific here since — per the earlier-cited research —
 * registration/sale-deed is the single most critical moment for PROPERTY
 * specifically (ownership legally transfers), which isn't true of, say, a
 * car (where registration is secondary to delivery).
 */
export const HOME_BUYING_RULE: MuhurtaRule = {
  occasion: 'homeBuying',
  name: 'Home Buying — Registration / Sale Deed',
  inauspiciousTithis: [T.shuklaChaturthi, T.shuklaNavami, T.shuklaChaturdashi, T.krishnaChaturthi, T.krishnaNavami, T.krishnaChaturdashi, T.amavasya],
  auspiciousVaras: [3, 4, 5],
  excludeBhadra: true,
  excludeAdhikaMasa: true,
  excludeEclipse: true,
  excludeGandaMula: true,
  excludePanchaka: true,
};

/**
 * Advance / Token Payment — a UNIVERSAL activity, deliberately not tied to
 * what's being bought (vehicle, home, land, anything). No source found
 * giving different Panchāṅga criteria per purchase type for this specific
 * stage — only that it's consistently the LEAST critical of the purchase
 * stages, wherever it was discussed. One shared rule; the "what for"
 * selector in the UI is for your own labelling/notes, not a different
 * calculation.
 */
export const ADVANCE_PAYMENT_RULE: MuhurtaRule = {
  occasion: 'advancePayment',
  name: 'Advance / Token Payment',
  inauspiciousTithis: [T.shuklaChaturthi, T.shuklaNavami, T.shuklaChaturdashi, T.krishnaChaturthi, T.krishnaNavami, T.krishnaChaturdashi, T.amavasya],
  excludeBhadra: true,
  excludeAdhikaMasa: true,
  excludeEclipse: true,
  excludePanchaka: true,
};

/** Agreement Signing — same universal treatment as Advance Payment above. */
export const AGREEMENT_SIGNING_RULE: MuhurtaRule = {
  occasion: 'agreementSigning',
  name: 'Agreement Signing',
  inauspiciousTithis: [T.shuklaChaturthi, T.shuklaNavami, T.shuklaChaturdashi, T.krishnaChaturthi, T.krishnaNavami, T.krishnaChaturdashi, T.amavasya],
  auspiciousVaras: [3, 4, 5],
  excludeBhadra: true,
  excludeAdhikaMasa: true,
  excludeEclipse: true,
  excludePanchaka: true,
};

export type PurchaseKind = 'vehicle' | 'property' | 'land' | 'other';
export const PURCHASE_KIND_LABELS: Record<PurchaseKind, string> = {
  vehicle: 'Vehicle', property: 'Home / Property', land: 'Land', other: 'Something else',
};

/**
 * House Shifting — deliberately DIFFERENT from Griha Praveśa. Griha
 * Praveśa is the full consecration ritual for FIRST entry into a
 * newly-built or newly-bought house. House Shifting covers: (a) moving
 * into a RENTED house, or (b) relocating your residence between houses you
 * already OWN and where Griha Praveśa has ALREADY been performed on both —
 * i.e. genuinely just moving, not a first-time consecration. Given this is
 * a lighter-weight event than Griha Praveśa, a general Panchāṅga Śuddhi
 * rule is used rather than Griha Praveśa's full nakṣatra-specific criteria
 * — no source was found treating "shifting between already-opened houses"
 * as needing the same strict nakṣatra table as first entry.
 */
export const HOUSE_SHIFTING_RULE: MuhurtaRule = {
  occasion: 'houseShifting',
  name: 'House Shifting (rented, or between already Griha-Pravesh-done houses)',
  inauspiciousTithis: [T.shuklaChaturthi, T.shuklaNavami, T.shuklaChaturdashi, T.krishnaChaturthi, T.krishnaNavami, T.krishnaChaturdashi, T.amavasya],
  auspiciousVaras: [1, 3, 4, 5],
  excludeBhadra: true,
  excludeAdhikaMasa: true,
  excludeEclipse: true,
  excludeGandaMula: true,
  excludePanchaka: true,
};

/**
 * Garbhādhāna / Nishekam — first union after marriage, one of the 16
 * classical Saṃskāras. IMPORTANT, stated plainly: this is traditionally
 * NOT the literal wedding night. Per the Gṛhya Sūtras, "nearly all
 * Sūtrakāras ordain that after marriage the couple should refrain from
 * conjugal intercourse for at least three nights." Majority North Indian
 * practice (Śukla Yajurveda followers) places it on the 4th day after the
 * wedding — it is even called "Chaturthīkarma." Other traditions place it
 * just after Gṛha Praveśam (itself often the day after the wedding). The
 * exact convention varies by family/Gṛhya-Sūtra/region — there is no
 * single universal day-offset, so this is presented as a general
 * auspicious-day search you'd point at the days following (or the
 * specific day chosen by) your own family's tradition, not a fixed
 * calculator. DrikPanchang runs an equivalent "Garbhadhana Muhurat" page,
 * confirming this is a genuine, established category — general Panchāṅga
 * Śuddhi criteria are used here since no distinct tithi/nakṣatra table for
 * Garbhādhāna specifically (as opposed to general auspicious-day rules)
 * was found in the sources checked.
 */
export const GARBHADHANA_RULE: MuhurtaRule = {
  occasion: 'garbhadhana',
  name: 'Garbhadhana / Nishekam (First union)',
  inauspiciousTithis: [T.shuklaChaturthi, T.shuklaNavami, T.shuklaChaturdashi, T.krishnaChaturthi, T.krishnaNavami, T.krishnaChaturdashi, T.amavasya],
  excludeBhadra: true,
  excludeEkadashi: true,
  excludeAdhikaMasa: true,
  excludeEclipse: true,
  excludeGandaMula: true,
  excludePanchaka: true,
};

export const CUSTOM_ACTIVITY_RULES: Record<string, MuhurtaRule> = {
  bhoomiPuja: BHOOMI_PUJA_RULE,
  homeBuying: HOME_BUYING_RULE,
  advancePayment: ADVANCE_PAYMENT_RULE,
  agreementSigning: AGREEMENT_SIGNING_RULE,
  houseShifting: HOUSE_SHIFTING_RULE,
  garbhadhana: GARBHADHANA_RULE,
};
