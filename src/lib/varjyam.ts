import type { DailyNakshatraInfo, DailyPanchangResult } from 'panchang-ts';

/**
 * Varjyam (Nakṣatra Thyajyam / Viṣagatika, "Visha Ghatis" in North India) —
 * a South Indian (Telugu/Tamil/Kannada) time-exclusion within each
 * nakṣatra, separate from Rāhu Kālam/Yamagaṇḍa/Gulika/Durmuhūrta. This was
 * entirely absent from the app before — a real P0 gap flagged in the audit
 * this was built in response to.
 *
 * Source: reliableastrology.com's "World Panchang" ghaṭika table. Stated
 * formula: "1 ghati = 1/60 of nakshatra duration. Duration of each Nak's
 * Vish Ghati = 1/15 of nak duration" — i.e. the nakṣatra's total span is
 * normalised to 60 ghaṭikas regardless of its actual clock-hour length,
 * and each nakṣatra has a specific 4-ghaṭika (1/15) range within that span
 * that is Viṣa (poison) time. The table's internal consistency (every
 * single range is exactly 4 ghaṭikas wide, matching its own stated rule)
 * is a good sign it's a coherent, systematic table — but this is a SINGLE
 * source for a specific, load-bearing numeric table, which is a real risk
 * for this particular kind of data. Flagged here rather than hidden; if a
 * second independent source with matching numbers is found later, this
 * comment should be updated to reflect that.
 *
 * NOT implemented yet, and stated plainly: the source ALSO documents a
 * cancellation condition — "Vish ghati does not apply if Moon in 4,5,7,9
 * or 10 [from the muhurta Lagna], or Moon is aspected by Jupiter/Venus, or
 * Lagna Lord in 1,4,7 or 10." This needs an election chart at the exact
 * candidate moment to check, which the Full Report already casts — a
 * genuine future refinement, not implemented here. Until then, Varjyam is
 * applied as a straightforward exclusion with no exceptions, which is the
 * conservative (safer, not over-permissive) default.
 */

// [fromGhatika, toGhatika] out of 60, per nakshatra, 0-indexed (Ashwini=0).
const VARJYAM_GHATIKA_RANGE: [number, number][] = [
  [50, 54], // Ashwini
  [24, 28], // Bharani
  [30, 34], // Krittika
  [40, 44], // Rohini
  [14, 18], // Mrigashira
  [11, 15], // Ardra
  [30, 34], // Punarvasu
  [20, 24], // Pushya
  [32, 36], // Ashlesha
  [30, 34], // Magha
  [20, 24], // Purva Phalguni
  [18, 22], // Uttara Phalguni
  [22, 26], // Hasta
  [20, 24], // Chitra
  [14, 18], // Swati
  [14, 18], // Vishakha
  [10, 14], // Anuradha
  [14, 18], // Jyeshtha
  [20, 24], // Mula
  [24, 28], // Purva Ashadha
  [20, 24], // Uttara Ashadha
  [10, 14], // Shravana
  [10, 14], // Dhanishtha
  [18, 22], // Shatabhisha
  [16, 20], // Purva Bhadrapada
  [24, 28], // Uttara Bhadrapada
  [30, 34], // Revati
];

export interface VarjyamInterval {
  start: Date;
  end: Date;
  nakshatraName: string;
}

/**
 * Given one daily nakshatra segment plus the day's sunrise (used as the
 * reference point for completionPercentage when the segment's true start
 * lies before sunrise — see the module comment on this assumption),
 * returns the Varjyam sub-interval within it, or null if it can't be
 * determined (missing endTime).
 */
function varjyamForSegment(seg: DailyNakshatraInfo, sunrise: Date): VarjyamInterval | null {
  if (!seg.endTime) return null;
  const end = seg.endTime;
  let start: Date;
  if (seg.startTime) {
    start = seg.startTime;
  } else {
    // Segment was already active at sunrise — reconstruct its true start
    // from completionPercentage (assumed measured at sunrise, the natural
    // day-level reference point) rather than guessing an average duration.
    const completion = seg.completionPercentage / 100;
    if (completion <= 0 || completion >= 1) return null; // can't safely invert
    const elapsedMs = end.getTime() - sunrise.getTime();
    const totalMs = elapsedMs / (1 - completion);
    start = new Date(end.getTime() - totalMs);
  }
  const totalMs = end.getTime() - start.getTime();
  if (totalMs <= 0) return null;
  const [fromG, toG] = VARJYAM_GHATIKA_RANGE[seg.index] ?? [null, null] as unknown as [number, number];
  if (fromG === null) return null;
  const varjyamStart = new Date(start.getTime() + (fromG / 60) * totalMs);
  const varjyamEnd = new Date(start.getTime() + (toG / 60) * totalMs);
  return { start: varjyamStart, end: varjyamEnd, nakshatraName: seg.name };
}

/** All Varjyam intervals across every nakshatra segment present in the day. */
export function getVarjyamIntervals(panchang: DailyPanchangResult): VarjyamInterval[] {
  return panchang.nakshatras
    .map((seg) => varjyamForSegment(seg, panchang.sunrise))
    .filter((x): x is VarjyamInterval => x !== null);
}
