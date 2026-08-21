/**
 * Panchaka terminology is unfortunately overloaded.
 *
 * 1) Nakshatra Panchaka = the Moon's transit through the terminal five
 *    nakshatras (Dhanishtha 2nd half through Revati). This is a separate
 *    observance used for particular activities/death rites and MUST NOT be
 *    labelled Mrityu/Agni/Raja/Chora/Roga merely from the nakshatra name.
 *
 * 2) Panchaka Rahita (especially important in Telugu/AP-TS Muhurta practice)
 *    is calculated for the ELECTED MOMENT from Tithi + Vara + Nakshatra +
 *    Udaya Lagna. Divide the sum by 9. Remainders 1,2,4,6,8 are the five
 *    Panchakas; 0,3,5,7 are Rahita.
 *
 * This file deliberately keeps the two concepts separate.
 */

export type PanchakaType = 'Mrityu' | 'Agni' | 'Raja' | 'Chora' | 'Roga' | null;

export const PANCHAKA_NAKSHATRAS = [
  'Dhanishtha', 'Shatabhisha', 'Purva Bhadrapada', 'Uttara Bhadrapada', 'Revati',
] as const;

/** @deprecated Do not derive Mrityu/Agni/Raja/Chora/Roga from terminal nakshatra. */
export function panchakaTypeFromNakshatra(_nakshatraName: string): PanchakaType {
  return null;
}

export interface PanchakaRahitaResult {
  total: number;
  remainder: number;
  type: PanchakaType;
  rahita: boolean;
  note: string;
}

const REMAINDER_TYPE: Record<number, PanchakaType> = {
  1: 'Mrityu',
  2: 'Agni',
  4: 'Raja',
  6: 'Chora',
  8: 'Roga',
};

export function calculatePanchakaRahita(
  tithiNumber: number,      // 1..30
  varaNumber: number,       // Sunday=1 .. Saturday=7
  nakshatraNumber: number,  // Ashwini=1 .. Revati=27
  lagnaNumber: number,      // Mesha=1 .. Meena=12
): PanchakaRahitaResult {
  const total = tithiNumber + varaNumber + nakshatraNumber + lagnaNumber;
  const remainder = total % 9;
  const type = REMAINDER_TYPE[remainder] ?? null;
  const rahita = type === null;
  return {
    total,
    remainder,
    type,
    rahita,
    note: rahita
      ? `Panchaka Rahita — remainder ${remainder} (Tithi + Vara + Nakshatra + Udaya Lagna = ${total}).`
      : `${type} Panchaka — remainder ${remainder} (Tithi + Vara + Nakshatra + Udaya Lagna = ${total}).`,
  };
}

/**
 * Extract a 1..30 tithi number defensively from panchang-ts-like objects.
 * Falls back to the Sanskrit/English tithi name and paksha when available.
 */
export function extractTithiNumber(tithi: unknown): number | null {
  if (!tithi || typeof tithi !== 'object') return null;
  const x = tithi as Record<string, unknown>;
  if (typeof x.number === 'number' && x.number >= 1 && x.number <= 30) return x.number;
  if (typeof x.index === 'number') {
    // Libraries differ between 0-based and 1-based indexes. Prefer explicit
    // paksha below if index is only 1..15; otherwise accept 0..29.
    if (x.index >= 15 && x.index <= 29) return x.index + 1;
  }
  const name = String(x.name ?? '').toLowerCase();
  const paksha = String(x.paksha ?? x.fortnight ?? '').toLowerCase();
  const names = ['pratipada','dwitiya','tritiya','chaturthi','panchami','shashthi','saptami','ashtami','navami','dashami','ekadashi','dwadashi','trayodashi','chaturdashi','purnima'];
  const aliases = ['prathama','dvitiya','tritiya','chaturthi','panchami','shashti','saptami','ashtami','navami','dashami','ekadashi','dvadashi','trayodashi','chaturdashi','purnima'];
  let n = names.findIndex((v) => name.includes(v));
  if (n < 0) n = aliases.findIndex((v) => name.includes(v));
  if (name.includes('amavas')) return 30;
  if (n < 0) return null;
  const day = n + 1;
  const krishna = paksha.includes('krishna') || paksha.includes('waning') || name.includes('krishna');
  return krishna ? day + 15 : day;
}

export function varaNumberFromName(name: string): number | null {
  const days = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
  const i = days.findIndex((d) => name.toLowerCase().includes(d));
  return i < 0 ? null : i + 1;
}

// Kept only so older UI code compiles. Day-level terminal-nakshatra Panchaka
// is no longer used to reject a Muhurta. Panchaka Rahita requires a Lagna and
// is therefore evaluated at the candidate time window instead.
export interface PanchakaExceptionRule {
  activity: string;
  avoid: PanchakaType[];
  tolerated: PanchakaType[];
  source: string;
}
export const PANCHAKA_EXCEPTIONS: PanchakaExceptionRule[] = [];

/**
 * Per-activity Panchaka tolerance — which of the five Panchaka Rahita
 * types (Mrityu/Agni/Raja/Chora/Roga) are AVOIDED vs TOLERATED for a given
 * activity. Source: Desabhatla (sreenivasdesabhatla.wordpress.com — already
 * cross-validated elsewhere in this app), citing Muhurta Chintamani /
 * Nirnaya Sindhu:
 *   - vivah / upanayanam: avoid Roga + Mrityu; tolerate Agni/Raja/Chora.
 *   - grihaPravesh: avoid Raja + Agni; tolerate Mrityu/Chora/Roga.
 *   - shopOpening: avoid Raja only.
 *   - travelStart / vahanKharidi: avoid Chora only.
 * Activities with no documented tolerance table (everything else) default
 * to "avoid all five" — the conservative default, not a fabricated
 * exception. This previously existed as an EMPTY array with a stub
 * function that always returned blocked:false regardless of what was
 * passed in — a real bug, not a design choice. Fixed here.
 */
const PANCHAKA_TOLERANCE: Record<string, Set<Exclude<PanchakaType, null>>> = {
  vivah: new Set(['Agni', 'Raja', 'Chora']),
  upanayanam: new Set(['Agni', 'Raja', 'Chora']),
  grihaPravesh: new Set(['Mrityu', 'Chora', 'Roga']),
  shopOpening: new Set(['Mrityu', 'Agni', 'Chora', 'Roga']),
  travelStart: new Set(['Mrityu', 'Agni', 'Raja', 'Roga']),
  vahanKharidi: new Set(['Mrityu', 'Agni', 'Raja', 'Roga']),
};

export function getPanchakaVerdict(
  activity: string,
  panchakaRahita: PanchakaRahitaResult | null,
  legacyNakshatraPanchakaActive: boolean,
): { blocked: boolean; note: string } {
  if (!panchakaRahita || panchakaRahita.rahita || !panchakaRahita.type) {
    return {
      blocked: false,
      note: legacyNakshatraPanchakaActive
        ? 'Nakshatra Panchaka is active (terminal 5 nakshatras) at some point today. This is shown as a separate caution; Panchaka Rahita (the type that actually matters) has at least one clean/tolerated Lagna window today — checked across the whole day, not just sunrise.'
        : 'Panchaka Rahita is clear, or has at least one tolerated Lagna window today (checked across the whole day, not just sunrise — see the Full Report for the precise value at each specific time window).',
    };
  }
  const tolerated = PANCHAKA_TOLERANCE[activity];
  const isTolerated = tolerated ? tolerated.has(panchakaRahita.type) : false;
  return {
    blocked: !isTolerated,
    note: isTolerated
      ? `${panchakaRahita.type} Panchaka is active in at least part of the day, but is a documented tolerated exception for this activity (source: Muhurta Chintamani / Nirnaya Sindhu, via Desabhatla).`
      : tolerated
        ? `${panchakaRahita.type} Panchaka is active across every Lagna window today and is NOT a documented exception for this activity — the whole day is avoided, not just a single moment.`
        : `${panchakaRahita.type} Panchaka is active across every Lagna window today. No documented tolerance table exists for this activity, so it defaults to avoided (conservative default, not a fabricated exception).`,
  };
}
